import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, desc } from "drizzle-orm";
import { users, clients, cases, contacts, type User, type Client, type Case, type Contact, type InsertUser, type InsertClient, type InsertCase, type InsertContact } from "../shared/schema.js";
import bcrypt from "bcrypt";
import { IStorage } from "./storage.js";

// Legacy compatibility interfaces
export interface LegalCase {
  id: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  caseType: string;
  urgency: string;
  description: string;
  status: string;
  hasLawyer: boolean | null;
  createdAt: Date | null;
}

export type InsertLegalCase = Omit<LegalCase, 'id' | 'status' | 'createdAt'>;

export class PostgresStorage implements IStorage {
  private db;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required for PostgreSQL connection");
    }

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    this.db = drizzle(pool);
    
    console.log('✅ PostgreSQL database connection established');
    
    // Initialize default admin user
    this.initializeDefaultAdmin().catch(error => {
      console.error('❌ Error initializing default admin:', error);
    });
  }

  private async initializeDefaultAdmin(): Promise<void> {
    try {
      // Check if admin user exists
      const existingAdmin = await this.getUserByUsername('admin');
      
      if (!existingAdmin) {
        // Create default admin user
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await this.db.insert(users).values({
          username: 'admin',
          password: hashedPassword,
          email: null,
          role: 'admin'
        });
        console.log('✅ Default admin user created (username: admin, password: admin123)');
      } else {
        console.log('✅ Admin user already exists');
      }
    } catch (error) {
      console.error('❌ Error initializing default admin:', error);
      throw error;
    }
  }

  // User Management
  async getUser(id: string): Promise<User | undefined> {
    try {
      const result = await this.db.select().from(users).where(eq(users.id, id));
      return result[0] || undefined;
    } catch (error) {
      console.error('Error getting user:', error);
      throw error;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const result = await this.db.select().from(users).where(eq(users.username, username));
      return result[0] || undefined;
    } catch (error) {
      console.error('Error getting user by username:', error);
      throw error;
    }
  }

  async createUser(user: InsertUser): Promise<User> {
    try {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      const result = await this.db.insert(users).values({
        username: user.username,
        password: hashedPassword,
        email: user.email || null,
        role: user.role
      }).returning();
      
      return result[0];
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  // Client Management
  async getClient(clientId: string | number): Promise<any> {
    try {
      const result = await this.db.select().from(clients).where(eq(clients.clientId, Number(clientId)));
      const client = result[0];
      
      if (!client) return undefined;
      
      // Convert to expected format for compatibility
      return {
        client_id: client.clientId.toString(),
        first_name: client.firstName,
        last_name: client.lastName,
        national_id: client.nationalId,
        phone_numbers: JSON.stringify(client.phoneNumbers),
        created_at: client.createdAt
      };
    } catch (error) {
      console.error('Error getting client:', error);
      throw error;
    }
  }

  async getAllClients(): Promise<any[]> {
    try {
      const result = await this.db.select().from(clients).orderBy(desc(clients.createdAt));
      
      return result.map(client => ({
        client_id: client.clientId.toString(),
        first_name: client.firstName,
        last_name: client.lastName,
        national_id: client.nationalId,
        phone_numbers: JSON.stringify(client.phoneNumbers),
        created_at: client.createdAt
      }));
    } catch (error) {
      console.error('Error getting all clients:', error);
      throw error;
    }
  }

  async createClient(firstName: string, lastName: string, nationalId: string, phoneNumbers: string[], password?: string): Promise<any> {
    try {
      let hashedPassword = null;
      if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
      }

      const result = await this.db.insert(clients).values({
        firstName,
        lastName,
        nationalId,
        phoneNumbers: phoneNumbers as any,
        password: hashedPassword
      }).returning();
      
      const client = result[0];
      return {
        client_id: client.clientId.toString(),
        first_name: client.firstName,
        last_name: client.lastName,
        national_id: client.nationalId,
        phone_numbers: JSON.stringify(client.phoneNumbers),
        created_at: client.createdAt
      };
    } catch (error) {
      console.error('Error creating client:', error);
      throw error;
    }
  }

  // Case Management
  async getCase(caseId: string | number): Promise<any> {
    try {
      const result = await this.db.select().from(cases).where(eq(cases.caseId, Number(caseId)));
      const case_ = result[0];
      
      if (!case_) return undefined;
      
      return {
        case_id: case_.caseId.toString(),
        client_id: case_.clientId.toString(),
        case_creation_date: case_.caseCreationDate,
        last_case_status: case_.lastCaseStatus,
        created_at: case_.createdAt
      };
    } catch (error) {
      console.error('Error getting case:', error);
      throw error;
    }
  }

  async getAllCases(): Promise<any[]> {
    try {
      const result = await this.db.select().from(cases).orderBy(desc(cases.createdAt));
      
      return result.map(case_ => ({
        case_id: case_.caseId.toString(),
        client_id: case_.clientId.toString(),
        case_creation_date: case_.caseCreationDate,
        last_case_status: case_.lastCaseStatus,
        created_at: case_.createdAt
      }));
    } catch (error) {
      console.error('Error getting all cases:', error);
      throw error;
    }
  }

  async createCase(clientId: string | number, status: string = 'under-review', customCaseId?: string): Promise<any> {
    try {
      const result = await this.db.insert(cases).values({
        clientId: Number(clientId),
        lastCaseStatus: status,
        caseCreationDate: new Date()
      }).returning();
      
      const case_ = result[0];
      return {
        case_id: case_.caseId.toString(),
        client_id: case_.clientId.toString(),
        case_creation_date: case_.caseCreationDate,
        last_case_status: case_.lastCaseStatus,
        created_at: case_.createdAt
      };
    } catch (error) {
      console.error('Error creating case:', error);
      throw error;
    }
  }

  async updateCaseStatus(caseId: string | number, status: string): Promise<any> {
    try {
      const result = await this.db
        .update(cases)
        .set({ lastCaseStatus: status, lastStatusDate: new Date() })
        .where(eq(cases.caseId, Number(caseId)))
        .returning();
      
      const case_ = result[0];
      if (!case_) return undefined;
      
      return {
        case_id: case_.caseId.toString(),
        client_id: case_.clientId.toString(),
        case_creation_date: case_.caseCreationDate,
        last_case_status: case_.lastCaseStatus,
        created_at: case_.createdAt
      };
    } catch (error) {
      console.error('Error updating case status:', error);
      throw error;
    }
  }

  // Contact Management
  async getContact(id: string): Promise<any> {
    try {
      const result = await this.db.select().from(contacts).where(eq(contacts.id, id));
      const contact = result[0];
      
      if (!contact) return undefined;
      
      return {
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        email: contact.email,
        subject: contact.subject,
        message: contact.message,
        createdAt: contact.createdAt
      };
    } catch (error) {
      console.error('Error getting contact:', error);
      throw error;
    }
  }

  async getAllContacts(): Promise<any[]> {
    try {
      const result = await this.db.select().from(contacts).orderBy(desc(contacts.createdAt));
      
      return result.map(contact => ({
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        email: contact.email,
        subject: contact.subject,
        message: contact.message,
        createdAt: contact.createdAt
      }));
    } catch (error) {
      console.error('Error getting all contacts:', error);
      throw error;
    }
  }

  async createContact(contact: any): Promise<any> {
    try {
      const result = await this.db.insert(contacts).values({
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        email: contact.email || null,
        subject: contact.subject,
        message: contact.message
      }).returning();
      
      const newContact = result[0];
      return {
        id: newContact.id,
        firstName: newContact.firstName,
        lastName: newContact.lastName,
        phone: newContact.phone,
        email: newContact.email,
        subject: newContact.subject,
        message: newContact.message,
        createdAt: newContact.createdAt
      };
    } catch (error) {
      console.error('Error creating contact:', error);
      throw error;
    }
  }

  // Legacy compatibility methods
  async getAllLegalCases(): Promise<LegalCase[]> {
    try {
      const result = await this.db.select().from(contacts).orderBy(desc(contacts.createdAt));
      
      return result.map(contact => ({
        id: contact.id!,
        clientName: `${contact.firstName} ${contact.lastName}`,
        clientPhone: contact.phone,
        clientEmail: contact.email,
        caseType: contact.subject,
        urgency: 'normal',
        description: contact.message,
        status: 'pending',
        hasLawyer: null,
        createdAt: contact.createdAt
      }));
    } catch (error) {
      console.error('Error getting all legal cases:', error);
      throw error;
    }
  }

  async createLegalCase(legalCase: InsertLegalCase): Promise<LegalCase> {
    try {
      const nameParts = legalCase.clientName.split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || '';
      
      const result = await this.db.insert(contacts).values({
        firstName,
        lastName,
        phone: legalCase.clientPhone,
        email: legalCase.clientEmail,
        subject: legalCase.caseType,
        message: legalCase.description
      }).returning();
      
      const contact = result[0];
      return {
        id: contact.id!,
        clientName: legalCase.clientName,
        clientPhone: legalCase.clientPhone,
        clientEmail: legalCase.clientEmail,
        caseType: legalCase.caseType,
        urgency: legalCase.urgency,
        description: legalCase.description,
        status: 'pending',
        hasLawyer: legalCase.hasLawyer,
        createdAt: contact.createdAt
      };
    } catch (error) {
      console.error('Error creating legal case:', error);
      throw error;
    }
  }

  // Client authentication methods
  async authenticateClient(nationalId: string, password: string): Promise<any> {
    try {
      const result = await this.db.select().from(clients).where(eq(clients.nationalId, nationalId));
      const client = result[0];
      
      if (!client || !client.password) {
        return null;
      }
      
      const isPasswordValid = await bcrypt.compare(password, client.password);
      if (!isPasswordValid) {
        return null;
      }
      
      return {
        client_id: client.clientId.toString(),
        first_name: client.firstName,
        last_name: client.lastName,
        national_id: client.nationalId,
        phone_numbers: JSON.stringify(client.phoneNumbers),
        created_at: client.createdAt
      };
    } catch (error) {
      console.error('Error authenticating client:', error);
      throw error;
    }
  }

  async updateClientPassword(clientId: string, newPassword: string): Promise<void> {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await this.db
        .update(clients)
        .set({ password: hashedPassword })
        .where(eq(clients.clientId, Number(clientId)));
    } catch (error) {
      console.error('Error updating client password:', error);
      throw error;
    }
  }

  async setClientPasswordByNationalId(nationalId: string, password: string): Promise<void> {
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      await this.db
        .update(clients)
        .set({ password: hashedPassword })
        .where(eq(clients.nationalId, nationalId));
    } catch (error) {
      console.error('Error setting client password by national ID:', error);
      throw error;
    }
  }

  async getClientCases(clientId: string): Promise<any[]> {
    try {
      const result = await this.db.select().from(cases).where(eq(cases.clientId, Number(clientId))).orderBy(desc(cases.createdAt));
      
      return result.map(case_ => ({
        case_id: case_.caseId.toString(),
        client_id: case_.clientId.toString(),
        case_creation_date: case_.caseCreationDate,
        last_case_status: case_.lastCaseStatus,
        created_at: case_.createdAt
      }));
    } catch (error) {
      console.error('Error getting client cases:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    // Neon serverless connections don't need explicit closing
    console.log('PostgreSQL connection closed');
  }
}