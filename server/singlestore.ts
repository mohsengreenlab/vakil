import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { IStorage } from "./storage.js";

// Define interfaces based on the new schema requirements
export interface Client {
  client_id: string;
  first_name: string;
  last_name: string;
  national_id: string;
  phone_numbers: string; // JSON string of phone numbers array
  created_at: Date;
}

export interface Case {
  case_id: string;
  client_id: string;
  case_creation_date: Date;
  last_case_status: string;
  created_at: Date;
}

export interface Admin {
  id: string;
  username: string;
  password: string;
  created_at: Date;
}

export interface ContactMessage {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  email: string;
  subject: string;
  message: string;
  created_at: Date;
}

// Legacy type adapters for existing code compatibility
export interface User {
  id: string;
  username: string;
  password: string;
  email: string | null;
  role: string;
  createdAt: Date | null;
}

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

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  subject: string;
  message: string;
  createdAt: Date | null;
}

export type InsertUser = Omit<User, 'id' | 'createdAt'>;
export type InsertLegalCase = Omit<LegalCase, 'id' | 'status' | 'createdAt'>;
export type InsertContact = Omit<Contact, 'id' | 'createdAt'>;

export class SingleStoreStorage {
  private pool: mysql.Pool;

  constructor() {
    // Check if required password is available
    if (!process.env.SINGLESTORE_PASSWORD) {
      throw new Error("SINGLESTORE_PASSWORD environment variable is required for SingleStore connection");
    }

    // Use the exact connection string format as specified
    const connectionString = `singlestore://dew-7b1a1:${process.env.SINGLESTORE_PASSWORD}@svc-3482219c-a389-4079-b18b-d50662524e8a-shared-dml.aws-virginia-6.svc.singlestore.com:3333/db_dew_f1c43?ssl={}`;
    
    this.pool = mysql.createPool({
      uri: connectionString,
      ssl: {
        ca: readFileSync('./singlestore-bundle.pem'),
        rejectUnauthorized: true
      },
      connectionLimit: 10,
      queueLimit: 0
    });
    
    // Initialize tables with error handling (don't throw to avoid crashing)
    this.initializeTables().catch(error => {
      console.error('❌ Error initializing SingleStore tables:', error);
      // Don't throw here - let the application continue with degraded functionality
    });
  }

  private async initializeTables(): Promise<void> {
    try {
      const connection = await this.pool.getConnection();
      
      // Create clients table (without unique constraint on national_id)
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS clients (
          client_id VARCHAR(4) PRIMARY KEY,
          first_name VARCHAR(255) NOT NULL,
          last_name VARCHAR(255) NOT NULL,
          national_id VARCHAR(10) NOT NULL,
          phone_numbers JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          SHARD KEY (client_id)
        )
      `);

      // Create national_id_registry table for global uniqueness
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS national_id_registry (
          national_id VARCHAR(10) PRIMARY KEY,
          client_id VARCHAR(4) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          SHARD KEY (national_id)
        )
      `);

      // Create cases table (co-located by client_id)
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS cases (
          case_id VARCHAR(7),
          client_id VARCHAR(4) NOT NULL,
          case_creation_date DATE NOT NULL,
          last_case_status VARCHAR(255) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (client_id, case_id),
          SHARD KEY (client_id)
        )
      `);

      // Create admins table (sharded by username for natural lookups)
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS admins (
          id VARCHAR(36),
          username VARCHAR(255) NOT NULL,
          password VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (username, id),
          SHARD KEY (username)
        )
      `);

      // Create contact_us_messages table
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS contact_us_messages (
          id VARCHAR(36) PRIMARY KEY,
          first_name VARCHAR(255) NOT NULL,
          last_name VARCHAR(255) NOT NULL,
          phone_number VARCHAR(20) NOT NULL,
          email VARCHAR(255),
          subject VARCHAR(500) NOT NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          SHARD KEY (id)
        )
      `);

      // Insert default admin if not exists
      const [adminExists] = await connection.execute(
        'SELECT COUNT(*) as count FROM admins WHERE username = ?',
        ['admin']
      );
      
      if ((adminExists as any)[0].count === 0) {
        const bcrypt = await import('bcrypt');
        const adminId = this.generateUUID();
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        await connection.execute(
          'INSERT INTO admins (id, username, password) VALUES (?, ?, ?)',
          [adminId, 'admin', hashedPassword]
        );
      } else {
        // Rehash existing plaintext passwords (migration fix)
        const bcrypt = await import('bcrypt');
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        await connection.execute(
          'UPDATE admins SET password = ? WHERE username = ? AND password NOT LIKE "$2%"',
          [hashedPassword, 'admin']
        );
      }

      connection.release();
      console.log('✅ SingleStore tables initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing SingleStore tables:', error);
      throw error;
    }
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private generateClientId(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  private generateCaseId(): string {
    return Math.floor(1000000 + Math.random() * 9000000).toString();
  }

  private async isClientIdUnique(clientId: string): Promise<boolean> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT COUNT(*) as count FROM clients WHERE client_id = ?',
        [clientId]
      );
      return (rows as any)[0].count === 0;
    } catch (error) {
      console.error('Error checking client ID uniqueness:', error);
      throw error;
    }
  }

  private async isCaseIdUnique(caseId: string): Promise<boolean> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT COUNT(*) as count FROM cases WHERE case_id = ?',
        [caseId]
      );
      return (rows as any)[0].count === 0;
    } catch (error) {
      console.error('Error checking case ID uniqueness:', error);
      throw error;
    }
  }

  // Legacy compatibility methods for existing code
  async getUser(id: string): Promise<User | undefined> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM admins WHERE id = ?',
        [id]
      );
      const admin = (rows as any)[0];
      if (admin) {
        return {
          id: admin.id,
          username: admin.username,
          password: admin.password,
          email: null,
          role: 'admin',
          createdAt: admin.created_at
        };
      }
      return undefined;
    } catch (error) {
      console.error('Error getting user:', error);
      throw error;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM admins WHERE username = ? ORDER BY created_at DESC LIMIT 1',
        [username]
      );
      const admin = (rows as any)[0];
      if (admin) {
        return {
          id: admin.id,
          username: admin.username,
          password: admin.password,
          email: null,
          role: 'admin',
          createdAt: admin.created_at
        };
      }
      return undefined;
    } catch (error) {
      console.error('Error getting user by username:', error);
      throw error;
    }
  }

  async createUser(user: InsertUser): Promise<User> {
    try {
      const bcrypt = await import('bcrypt');
      const id = this.generateUUID();
      const hashedPassword = bcrypt.hashSync(user.password, 10);
      await this.pool.execute(
        'INSERT INTO admins (id, username, password) VALUES (?, ?, ?)',
        [id, user.username, hashedPassword]
      );
      return {
        id,
        username: user.username,
        password: user.password,
        email: user.email || null,
        role: user.role,
        createdAt: new Date()
      };
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async getLegalCase(id: string): Promise<LegalCase | undefined> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM contact_us_messages WHERE id = ?',
        [id]
      );
      const contact = (rows as any)[0];
      if (contact) {
        // Convert contact to legacy case format for compatibility
        return {
          id: contact.id,
          clientName: `${contact.first_name} ${contact.last_name}`,
          clientPhone: contact.phone_number,
          clientEmail: contact.email || null,
          caseType: contact.subject,
          urgency: 'normal',
          description: contact.message,
          status: 'pending',
          hasLawyer: null,
          createdAt: contact.created_at
        };
      }
      return undefined;
    } catch (error) {
      console.error('Error getting legal case:', error);
      throw error;
    }
  }

  async getAllLegalCases(): Promise<LegalCase[]> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM contact_us_messages ORDER BY created_at DESC'
      );
      return (rows as any[]).map(contact => ({
        id: contact.id,
        clientName: `${contact.first_name} ${contact.last_name}`,
        clientPhone: contact.phone_number,
        clientEmail: contact.email,
        caseType: contact.subject,
        urgency: 'normal',
        description: contact.message,
        status: 'pending',
        hasLawyer: false,
        createdAt: contact.created_at
      }));
    } catch (error) {
      console.error('Error getting all legal cases:', error);
      throw error;
    }
  }

  async createLegalCase(legalCase: InsertLegalCase): Promise<LegalCase> {
    try {
      const id = this.generateUUID();
      const nameParts = legalCase.clientName.split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || '';
      
      await this.pool.execute(
        'INSERT INTO contact_us_messages (id, first_name, last_name, phone_number, email, subject, message) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, firstName, lastName, legalCase.clientPhone, legalCase.clientEmail, legalCase.caseType, legalCase.description]
      );
      
      return {
        id,
        clientName: legalCase.clientName,
        clientPhone: legalCase.clientPhone,
        clientEmail: legalCase.clientEmail,
        caseType: legalCase.caseType,
        urgency: legalCase.urgency,
        description: legalCase.description,
        status: 'pending',
        hasLawyer: legalCase.hasLawyer || null,
        createdAt: new Date()
      };
    } catch (error) {
      console.error('Error creating legal case:', error);
      throw error;
    }
  }

  async updateLegalCaseStatus(id: string, status: string): Promise<LegalCase | undefined> {
    try {
      // Since we're storing in contact_us_messages table, we can't update status directly
      // Return the existing case for compatibility
      return await this.getLegalCase(id);
    } catch (error) {
      console.error('Error updating legal case status:', error);
      throw error;
    }
  }

  async getContact(id: string): Promise<Contact | undefined> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM contact_us_messages WHERE id = ?',
        [id]
      );
      const contact = (rows as any)[0];
      if (contact) {
        return {
          id: contact.id,
          firstName: contact.first_name,
          lastName: contact.last_name,
          phone: contact.phone_number,
          email: contact.email || null,
          subject: contact.subject,
          message: contact.message,
          createdAt: contact.created_at
        };
      }
      return undefined;
    } catch (error) {
      console.error('Error getting contact:', error);
      throw error;
    }
  }

  async getAllContacts(): Promise<Contact[]> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM contact_us_messages ORDER BY created_at DESC'
      );
      return (rows as any[]).map(contact => ({
        id: contact.id,
        firstName: contact.first_name,
        lastName: contact.last_name,
        phone: contact.phone_number,
        email: contact.email || null,
        subject: contact.subject,
        message: contact.message,
        createdAt: contact.created_at
      }));
    } catch (error) {
      console.error('Error getting all contacts:', error);
      throw error;
    }
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    try {
      const id = this.generateUUID();
      await this.pool.execute(
        'INSERT INTO contact_us_messages (id, first_name, last_name, phone_number, email, subject, message) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, contact.firstName, contact.lastName, contact.phone, contact.email, contact.subject, contact.message]
      );
      
      return {
        id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        email: contact.email || null,
        subject: contact.subject,
        message: contact.message,
        createdAt: new Date()
      };
    } catch (error) {
      console.error('Error creating contact:', error);
      throw error;
    }
  }

  // New methods specific to SingleStore schema
  async createClient(firstName: string, lastName: string, nationalId: string, phoneNumbers: string[]): Promise<Client> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      let clientId: string;
      do {
        clientId = this.generateClientId();
      } while (!(await this.isClientIdUnique(clientId)));

      // First, insert into national_id_registry to enforce global uniqueness
      await connection.execute(
        'INSERT INTO national_id_registry (national_id, client_id) VALUES (?, ?)',
        [nationalId, clientId]
      );

      // Then, insert into clients table
      await connection.execute(
        'INSERT INTO clients (client_id, first_name, last_name, national_id, phone_numbers) VALUES (?, ?, ?, ?, ?)',
        [clientId, firstName, lastName, nationalId, JSON.stringify(phoneNumbers)]
      );

      await connection.commit();

      return {
        client_id: clientId,
        first_name: firstName,
        last_name: lastName,
        national_id: nationalId,
        phone_numbers: JSON.stringify(phoneNumbers),
        created_at: new Date()
      };
    } catch (error) {
      await connection.rollback();
      console.error('Error creating client:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  async createCase(clientId: string | number, lastCaseStatus: string = 'under-review', customCaseId?: string): Promise<Case> {
    try {
      let caseId: string;
      if (customCaseId && customCaseId.trim()) {
        // Use provided case ID if it's unique
        if (await this.isCaseIdUnique(customCaseId.trim())) {
          caseId = customCaseId.trim();
        } else {
          throw new Error(`شناسه پرونده ${customCaseId} قبلاً استفاده شده است`);
        }
      } else {
        // Auto-generate unique case ID
        do {
          caseId = this.generateCaseId();
        } while (!(await this.isCaseIdUnique(caseId)));
      }

      const caseCreationDate = new Date().toISOString().split('T')[0];
      
      await this.pool.execute(
        'INSERT INTO cases (case_id, client_id, case_creation_date, last_case_status) VALUES (?, ?, ?, ?)',
        [caseId, String(clientId), caseCreationDate, lastCaseStatus]
      );

      return {
        case_id: caseId,
        client_id: String(clientId),
        case_creation_date: new Date(caseCreationDate),
        last_case_status: lastCaseStatus,
        created_at: new Date()
      };
    } catch (error) {
      console.error('Error creating case:', error);
      throw error;
    }
  }

  async getClient(clientId: string | number): Promise<Client | undefined> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM clients WHERE client_id = ?',
        [String(clientId)]
      );
      return (rows as any)[0] || undefined;
    } catch (error) {
      console.error('Error getting client:', error);
      throw error;
    }
  }

  async getAllClients(): Promise<Client[]> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM clients ORDER BY created_at DESC'
      );
      return rows as Client[];
    } catch (error) {
      console.error('Error getting all clients:', error);
      throw error;
    }
  }

  async getCase(caseId: string | number): Promise<Case | undefined> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM cases WHERE case_id = ?',
        [String(caseId)]
      );
      return (rows as any)[0] || undefined;
    } catch (error) {
      console.error('Error getting case:', error);
      throw error;
    }
  }

  async getAllCases(): Promise<Case[]> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM cases ORDER BY created_at DESC'
      );
      return rows as Case[];
    } catch (error) {
      console.error('Error getting all cases:', error);
      throw error;
    }
  }

  async updateCaseStatus(caseId: string | number, status: string): Promise<Case | undefined> {
    try {
      await this.pool.execute(
        'UPDATE cases SET last_case_status = ? WHERE case_id = ?',
        [status, String(caseId)]
      );
      return await this.getCase(caseId);
    } catch (error) {
      console.error('Error updating case status:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

}