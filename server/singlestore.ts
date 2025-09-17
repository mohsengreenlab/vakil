import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { IStorage } from "./storage.js";
import * as bcrypt from 'bcrypt';
import { getConfig } from "./config.js";
import { type CaseEvent, type InsertCaseEvent, type ClientFile, type InsertClientFile, type Message, type InsertMessage } from "@shared/schema";

// Define interfaces based on the new schema requirements
export interface Client {
  client_id: string;
  first_name: string;
  last_name: string;
  national_id: string;
  phone_numbers: string; // JSON string of phone numbers array
  password?: string;
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

export interface QAItem {
  id: string;
  question: string;
  answer: string;
  topic: string;
  show: number;
  date_created: Date;
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
export type InsertQAItem = Omit<QAItem, 'id' | 'date_created'>;

export class SingleStoreStorage {
  private pool: mysql.Pool;

  constructor() {
    // Check if we're in production or development mode
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      // Production: Use environment variables
      const config = getConfig();
      const connectionString = `singlestore://${config.database.username}:${config.database.password}@${config.database.host}:${config.database.port}/${config.database.database}?ssl={}`;
      
      this.pool = mysql.createPool({
        uri: connectionString,
        ssl: config.database.sslMode ? {
          ca: config.database.sslCertPath ? readFileSync(config.database.sslCertPath) : readFileSync('./singlestore-bundle.pem'),
          rejectUnauthorized: true
        } : undefined,
        connectionLimit: config.database.connectionLimit,
        queueLimit: config.database.queueLimit
      });
    } else {
      // Development: Use existing hardcoded configuration for compatibility
      if (!process.env.SINGLESTORE_PASSWORD) {
        throw new Error("SINGLESTORE_PASSWORD environment variable is required for SingleStore connection");
      }

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
    }
    
    // Initialize tables with error handling (don't throw to avoid crashing)
    this.initializeTables().catch(error => {
      console.error('❌ Error initializing SingleStore tables:', error);
      // Don't throw here - let the application continue with degraded functionality
    });
  }

  private async initializeTables(): Promise<void> {
    try {
      const connection = await this.pool.getConnection();
      
      // Drop test_table if it exists to make space for Case_Events table
      try {
        await connection.execute('DROP TABLE IF EXISTS test_table');
        console.log('🗑️ Dropped test_table to make space for Case_Events');
      } catch (dropError) {
        console.log('ℹ️ test_table does not exist or already dropped');
      }
      
      // Create clients table (without unique constraint on national_id)
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS clients (
          client_id VARCHAR(4) PRIMARY KEY,
          first_name VARCHAR(255) NOT NULL,
          last_name VARCHAR(255) NOT NULL,
          national_id VARCHAR(10) NOT NULL,
          phone_numbers JSON NOT NULL,
          password VARCHAR(255) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          SHARD KEY (client_id)
        )
      `);

      // Alter the table to ensure password column is large enough for bcrypt hashes
      try {
        await connection.execute(`
          ALTER TABLE clients MODIFY COLUMN password VARCHAR(255) DEFAULT NULL
        `);
      } catch (alterError) {
        console.log('Password column already correct or table structure is fine');
      }

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

      // Create QA table for questions and answers
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS QA (
          id VARCHAR(36) PRIMARY KEY,
          question TEXT NOT NULL,
          answer TEXT NOT NULL,
          topic VARCHAR(255) NOT NULL,
          \`show\` TINYINT(1) NOT NULL DEFAULT 1,
          date_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          SHARD KEY (id)
        )
      `);

      // Create Case_Events table for tracking case events
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS Case_Events (
          id VARCHAR(36) PRIMARY KEY,
          case_id VARCHAR(7) NOT NULL,
          event_type TEXT NOT NULL,
          occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          details TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          SHARD KEY (id)
        )
      `);

      // Create client_files table for file uploads
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS client_files (
          id VARCHAR(36) PRIMARY KEY,
          client_id VARCHAR(4) NOT NULL,
          file_name VARCHAR(500) NOT NULL,
          original_file_name VARCHAR(500) NOT NULL,
          file_size VARCHAR(20) NOT NULL,
          mime_type VARCHAR(255) NOT NULL,
          description TEXT,
          file_path VARCHAR(1000) NOT NULL,
          upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          uploaded_by_type VARCHAR(10) NOT NULL DEFAULT 'client',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          SHARD KEY (id),
          INDEX (client_id)
        )
      `);

      // Add uploaded_by_type column if it doesn't exist (for existing tables)
      try {
        await connection.execute(`
          ALTER TABLE client_files ADD COLUMN uploaded_by_type VARCHAR(10) NOT NULL DEFAULT 'client'
        `);
        console.log('✅ Added uploaded_by_type column to client_files table');
      } catch (alterError) {
        // Column already exists or other issue - this is expected after first run
        console.log('ℹ️ uploaded_by_type column already exists or table is properly configured');
      }

      // Check existing client_files table data
      try {
        const [existingFiles] = await connection.execute('SELECT COUNT(*) as file_count FROM client_files');
        const fileCount = (existingFiles as any)[0].file_count;
        console.log(`📁 client_files table: ${fileCount} existing files found`);
        
        if (fileCount > 0) {
          const [recentFiles] = await connection.execute('SELECT client_id, file_name, upload_date FROM client_files ORDER BY upload_date DESC LIMIT 5');
          console.log('📁 Recent client files:', recentFiles);
        }
      } catch (checkError) {
        console.log('ℹ️ client_files table check:', (checkError as Error).message);
      }

      // Create messages table for admin-client communication
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS messages (
          id VARCHAR(36) PRIMARY KEY,
          client_id VARCHAR(4) NOT NULL,
          sender_role VARCHAR(10) NOT NULL,
          message_content TEXT NOT NULL,
          is_read VARCHAR(5) NOT NULL DEFAULT 'false',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          SHARD KEY (id),
          INDEX (client_id),
          INDEX (created_at)
        )
      `);
      console.log('✅ Messages table created/verified for admin-client communication');

      // Check existing QA table structure to understand ID type
      try {
        const [existingRows] = await connection.execute('SELECT * FROM QA LIMIT 1');
        console.log('🔍 Existing QA table sample:', existingRows);
        
        // Check if there are any existing rows to understand the ID format
        if ((existingRows as any[]).length > 0) {
          const sampleId = (existingRows as any[])[0].id;
          console.log('📋 Sample QA ID format:', typeof sampleId, sampleId);
        } else {
          console.log('📋 QA table is empty - will use UUID format');
        }
      } catch (checkError) {
        console.log('ℹ️ QA table check:', (checkError as Error).message);
      }

      // Insert default admin if not exists
      const [adminExists] = await connection.execute(
        'SELECT COUNT(*) as count FROM admins WHERE username = ?',
        ['admin']
      );
      
      // SECURITY FIX: Only create admin user if ADMIN_PASSWORD environment variable is set
      // This removes the hardcoded "admin123" password vulnerability
      if ((adminExists as any)[0].count === 0) {
        if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 8) {
          const bcrypt = await import('bcrypt');
          const adminId = this.generateUUID();
          const hashedPassword = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
          await connection.execute(
            'INSERT INTO admins (id, username, password) VALUES (?, ?, ?)',
            [adminId, 'admin', hashedPassword]
          );
          console.log('✅ SingleStore: Admin user created with environment-provided password');
        } else {
          console.log('⚠️  SingleStore: No admin user created - set ADMIN_PASSWORD environment variable (min 8 chars)');
        }
      } else {
        // SECURITY FIX: Only update passwords if ADMIN_PASSWORD is provided
        // Remove automatic rehashing with hardcoded password
        if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 8) {
          const bcrypt = await import('bcrypt');
          const hashedPassword = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
          await connection.execute(
            'UPDATE admins SET password = ? WHERE username = ? AND password NOT LIKE "$2%"',
            [hashedPassword, 'admin']
          );
          console.log('✅ SingleStore: Updated legacy plaintext passwords');
        }
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

  async getAllLegalCases(): Promise<any[]> {
    try {
      // Query cases with client information and get latest status from Case_Events
      const [rows] = await this.pool.execute(`
        SELECT 
          c.case_id,
          c.client_id, 
          c.case_creation_date,
          c.last_case_status,
          cl.first_name,
          cl.last_name,
          cl.phone_numbers,
          COALESCE(
            (SELECT ce.event_type 
             FROM Case_Events ce 
             WHERE ce.case_id = c.case_id 
             ORDER BY ce.occurred_at DESC 
             LIMIT 1), 
            c.last_case_status
          ) as current_status
        FROM cases c
        LEFT JOIN clients cl ON c.client_id = cl.client_id
        ORDER BY c.case_creation_date DESC
      `);
      
      return (rows as any[]).map(row => ({
        case_id: row.case_id,
        client_id: row.client_id,
        client_name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        last_case_status: row.current_status,
        case_creation_date: row.case_creation_date,
        phone_numbers: row.phone_numbers
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
  async createClient(firstName: string, lastName: string, nationalId: string, phoneNumbers: string[], password?: string): Promise<Client> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      let clientId: string;
      do {
        clientId = this.generateClientId();
      } while (!(await this.isClientIdUnique(clientId)));

      // Store password as plain text if provided
      let plainPassword = null;
      if (password) {
        plainPassword = password;
      }

      // First, insert into national_id_registry to enforce global uniqueness
      await connection.execute(
        'INSERT INTO national_id_registry (national_id, client_id) VALUES (?, ?)',
        [nationalId, clientId]
      );

      // Then, insert into clients table with password
      await connection.execute(
        'INSERT INTO clients (client_id, first_name, last_name, national_id, phone_numbers, password) VALUES (?, ?, ?, ?, ?, ?)',
        [clientId, firstName, lastName, nationalId, JSON.stringify(phoneNumbers), plainPassword]
      );

      await connection.commit();

      return {
        client_id: clientId,
        first_name: firstName,
        last_name: lastName,
        national_id: nationalId,
        phone_numbers: JSON.stringify(phoneNumbers),
        password: plainPassword || undefined,
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

  // Client authentication and password management methods
  async authenticateClient(nationalId: string, password: string): Promise<Client | null> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM clients WHERE national_id = ?',
        [nationalId]
      );
      
      const client = (rows as any)[0];
      if (!client || !client.password) {
        return null;
      }
      
      // Check if password is already bcrypt hashed (starts with $2)
      let isPasswordValid = false;
      if (client.password.startsWith('$2')) {
        // This is a bcrypt hash, use bcrypt.compare
        isPasswordValid = await bcrypt.compare(password, client.password);
      } else {
        // This is plain text password, do direct comparison
        isPasswordValid = password === client.password;
      }
      
      if (!isPasswordValid) {
        return null;
      }
      
      return {
        client_id: client.client_id,
        first_name: client.first_name,
        last_name: client.last_name,
        national_id: client.national_id,
        phone_numbers: client.phone_numbers,
        password: undefined, // Don't return password
        created_at: client.created_at
      };
    } catch (error) {
      console.error('Error authenticating client:', error);
      throw error;
    }
  }

  async updateClientPassword(clientId: string, newPassword: string): Promise<void> {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await this.pool.execute(
        'UPDATE clients SET password = ? WHERE client_id = ?',
        [hashedPassword, clientId]
      );
    } catch (error) {
      console.error('Error updating client password:', error);
      throw error;
    }
  }

  async setClientPasswordByNationalId(nationalId: string, password: string): Promise<void> {
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      await this.pool.execute(
        'UPDATE clients SET password = ? WHERE national_id = ?',
        [hashedPassword, nationalId]
      );
    } catch (error) {
      console.error('Error setting client password:', error);
      throw error;
    }
  }

  async getClientCases(clientId: string): Promise<Case[]> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM cases WHERE client_id = ? ORDER BY created_at DESC',
        [clientId]
      );
      return rows as Case[];
    } catch (error) {
      console.error('Error getting client cases:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // QA CRUD operations

  async getAllQAItems(): Promise<QAItem[]> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM QA ORDER BY date_created DESC'
      );
      return (rows as any[]).map(row => ({
        id: row.ID,
        question: row.Question,
        answer: row.Answer,
        topic: row.Topic,
        show: row.show,
        date_created: row.date_created
      }));
    } catch (error) {
      console.error('Error getting all QA items:', error);
      throw error;
    }
  }

  async getPublicQAItems(): Promise<QAItem[]> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM QA WHERE `show` = 1 ORDER BY date_created DESC'
      );
      return (rows as any[]).map(row => ({
        id: row.ID,
        question: row.Question,
        answer: row.Answer,
        topic: row.Topic,
        show: row.show,
        date_created: row.date_created
      }));
    } catch (error) {
      console.error('Error getting public QA items:', error);
      throw error;
    }
  }

  async createQAItem(qaData: InsertQAItem): Promise<QAItem> {
    try {
      // Use numeric ID instead of UUID for compatibility with existing INT primary key
      const id = Date.now().toString();
      

      await this.pool.execute(
        'INSERT INTO QA (id, question, answer, topic, `show`) VALUES (?, ?, ?, ?, ?)',
        [id, qaData.question, qaData.answer, qaData.topic, qaData.show]
      );

      // Return the created QA item
      const [rows] = await this.pool.execute(
        'SELECT * FROM QA WHERE id = ?',
        [id]
      );
      const createdQA = (rows as any)[0];
      return {
        id: createdQA.ID,
        question: createdQA.Question,
        answer: createdQA.Answer,
        topic: createdQA.Topic,
        show: createdQA.show,
        date_created: createdQA.date_created
      };
    } catch (error) {
      console.error('Error creating QA item:', error);
      throw error;
    }
  }

  async updateQAItem(id: string, qaData: Partial<InsertQAItem>): Promise<QAItem | null> {
    try {
      const updateFields = [];
      const updateValues = [];

      if (qaData.question !== undefined) {
        updateFields.push('question = ?');
        updateValues.push(qaData.question);
      }
      if (qaData.answer !== undefined) {
        updateFields.push('answer = ?');
        updateValues.push(qaData.answer);
      }
      if (qaData.topic !== undefined) {
        updateFields.push('topic = ?');
        updateValues.push(qaData.topic);
      }
      if (qaData.show !== undefined) {
        updateFields.push('`show` = ?');
        updateValues.push(qaData.show);
      }

      if (updateFields.length === 0) {
        return null; // No fields to update
      }

      updateValues.push(id);
      await this.pool.execute(
        `UPDATE QA SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );

      // Return the updated QA item
      const [rows] = await this.pool.execute(
        'SELECT * FROM QA WHERE id = ?',
        [id]
      );
      const updatedQA = (rows as any)[0];
      return updatedQA ? {
        id: updatedQA.ID,
        question: updatedQA.Question,
        answer: updatedQA.Answer,
        topic: updatedQA.Topic,
        show: updatedQA.show,
        date_created: updatedQA.date_created
      } : null;
    } catch (error) {
      console.error('Error updating QA item:', error);
      throw error;
    }
  }

  async deleteQAItem(id: string): Promise<boolean> {
    try {
      const [result] = await this.pool.execute(
        'DELETE FROM QA WHERE id = ?',
        [id]
      );
      return (result as any).affectedRows > 0;
    } catch (error) {
      console.error('Error deleting QA item:', error);
      throw error;
    }
  }

  async getQAItem(id: string): Promise<QAItem | null> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM QA WHERE id = ?',
        [id]
      );
      const qa = (rows as any)[0];
      return qa ? {
        id: qa.ID,
        question: qa.Question,
        answer: qa.Answer,
        topic: qa.Topic,
        show: qa.show,
        date_created: qa.date_created
      } : null;
    } catch (error) {
      console.error('Error getting QA item:', error);
      throw error;
    }
  }

  // Case Events methods
  async getCaseEvents(caseId: string | number): Promise<CaseEvent[]> {
    try {
      const caseIdStr = caseId.toString();
      const [rows] = await this.pool.execute(
        'SELECT * FROM Case_Events WHERE case_id = ? ORDER BY occurred_at DESC',
        [caseIdStr]
      );
      return (rows as any[]).map(event => ({
        id: event.id,
        caseId: event.case_id,
        eventType: event.event_type,
        occurredAt: event.occurred_at,
        details: event.details,
        createdAt: event.created_at
      }));
    } catch (error) {
      console.error('Error getting case events:', error);
      throw error;
    }
  }

  async getClientCaseEvents(clientId: string | number): Promise<{ case: Case, events: CaseEvent[] }[]> {
    try {
      // Get all cases for the client
      const clientCases = await this.getClientCases(clientId.toString());
      
      const result = [];
      for (const case_ of clientCases) {
        const events = await this.getCaseEvents(case_.case_id);
        result.push({ case: case_, events });
      }
      
      return result;
    } catch (error) {
      console.error('Error getting client case events:', error);
      throw error;
    }
  }

  async createCaseEvent(caseEvent: InsertCaseEvent): Promise<CaseEvent> {
    try {
      const id = this.generateUUID();
      await this.pool.execute(
        'INSERT INTO Case_Events (id, case_id, event_type, details) VALUES (?, ?, ?, ?)',
        [id, caseEvent.caseId, caseEvent.eventType, caseEvent.details]
      );
      
      // Retrieve the created event
      const [rows] = await this.pool.execute(
        'SELECT * FROM Case_Events WHERE id = ?',
        [id]
      );
      const event = (rows as any)[0];
      
      // Sync the case status after creating the event
      await this.syncCaseStatus(caseEvent.caseId);
      
      return {
        id: event.id,
        caseId: event.case_id,
        eventType: event.event_type,
        occurredAt: event.occurred_at,
        details: event.details,
        createdAt: event.created_at
      };
    } catch (error) {
      console.error('Error creating case event:', error);
      throw error;
    }
  }

  async updateCaseEvent(eventId: string, updates: Partial<InsertCaseEvent>): Promise<CaseEvent | null> {
    try {
      // First get the caseId for syncing later
      const [caseIdRows] = await this.pool.execute(
        'SELECT case_id FROM Case_Events WHERE id = ?',
        [eventId]
      );
      const caseId = (caseIdRows as any)[0]?.case_id;
      
      // Build dynamic update query based on provided fields
      const updateFields = [];
      const values = [];
      
      if (updates.eventType !== undefined) {
        updateFields.push('event_type = ?');
        values.push(updates.eventType);
      }
      
      if (updates.details !== undefined) {
        updateFields.push('details = ?');
        values.push(updates.details);
      }
      
      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }
      
      values.push(eventId);
      
      await this.pool.execute(
        `UPDATE Case_Events SET ${updateFields.join(', ')} WHERE id = ?`,
        values
      );
      
      // Retrieve the updated event
      const [rows] = await this.pool.execute(
        'SELECT * FROM Case_Events WHERE id = ?',
        [eventId]
      );
      const event = (rows as any)[0];
      
      if (!event) {
        return null;
      }
      
      // Sync case status if the event was updated and we have the caseId
      if (caseId) {
        await this.syncCaseStatus(caseId);
      }
      
      return {
        id: event.id,
        caseId: event.case_id,
        eventType: event.event_type,
        occurredAt: event.occurred_at,
        details: event.details,
        createdAt: event.created_at
      };
    } catch (error) {
      console.error('Error updating case event:', error);
      throw error;
    }
  }

  async deleteCaseEvent(eventId: string): Promise<boolean> {
    try {
      // First get the caseId of the event being deleted for sync
      const [eventRows] = await this.pool.execute(
        'SELECT case_id FROM Case_Events WHERE id = ?',
        [eventId]
      );
      const caseId = (eventRows as any)[0]?.case_id;
      
      const [result] = await this.pool.execute(
        'DELETE FROM Case_Events WHERE id = ?',
        [eventId]
      );
      
      const deleted = (result as any).affectedRows > 0;
      
      // Sync the case status if event was deleted
      if (deleted && caseId) {
        await this.syncCaseStatus(caseId);
      }
      
      return deleted;
    } catch (error) {
      console.error('Error deleting case event:', error);
      throw error;
    }
  }

  // Sync function to update cases.last_case_status with latest event
  private async syncCaseStatus(caseId: string): Promise<void> {
    try {
      // Get the most recent event and the client_id for this case
      const [eventAndCaseRows] = await this.pool.execute(`
        SELECT 
          ce.event_type,
          c.client_id
        FROM Case_Events ce
        INNER JOIN cases c ON ce.case_id = c.case_id
        WHERE ce.case_id = ?
        ORDER BY ce.occurred_at DESC
        LIMIT 1
      `, [caseId]);
      
      const result = (eventAndCaseRows as any)[0];
      
      if (result) {
        // Case has events, update with latest event type
        await this.pool.execute(
          'UPDATE cases SET last_case_status = ? WHERE client_id = ? AND case_id = ?',
          [result.event_type, result.client_id, caseId]
        );
        console.log(`🔄 Synced case ${caseId} status to: ${result.event_type}`);
      } else {
        // Case has no events, get client_id from cases table and set to 'pending'
        const [caseRows] = await this.pool.execute(
          'SELECT client_id FROM cases WHERE case_id = ?',
          [caseId]
        );
        const caseData = (caseRows as any)[0];
        
        if (caseData) {
          await this.pool.execute(
            'UPDATE cases SET last_case_status = ? WHERE client_id = ? AND case_id = ?',
            ['pending', caseData.client_id, caseId]
          );
          console.log(`🔄 Synced case ${caseId} status to: pending (no events)`);
        }
      }
    } catch (error) {
      console.error(`Error syncing case status for ${caseId}:`, error);
      // Don't throw - allow the main operation to complete
      console.warn(`⚠️  Case ${caseId} sync failed, but main operation continued`);
    }
  }

  // Bulk sync all cases - useful for maintenance
  async syncAllCaseStatuses(): Promise<void> {
    try {
      console.log('🔄 Starting bulk sync of all case statuses...');
      
      // Get all cases (client_id, case_id pairs)
      const [caseRows] = await this.pool.execute('SELECT client_id, case_id FROM cases');
      const cases = (caseRows as any[]);
      
      // Sync each case
      for (const caseData of cases) {
        await this.syncCaseStatus(caseData.case_id);
      }
      
      console.log(`✅ Completed bulk sync for ${cases.length} cases`);
    } catch (error) {
      console.error('Error during bulk sync:', error);
      throw error;
    }
  }

  // Client File methods
  async getClientFile(fileId: string): Promise<ClientFile | undefined> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM client_files WHERE id = ?',
        [fileId]
      );
      const file = (rows as any)[0];
      if (!file) return undefined;

      return {
        id: file.id,
        clientId: parseInt(file.client_id),
        fileName: file.file_name,
        originalFileName: file.original_file_name,
        fileSize: file.file_size,
        mimeType: file.mime_type,
        description: file.description,
        filePath: file.file_path,
        uploadDate: file.upload_date,
        uploadedByType: file.uploaded_by_type || 'client',
        createdAt: file.created_at,
      };
    } catch (error) {
      console.error('Error getting client file:', error);
      throw error;
    }
  }

  async getClientFiles(clientId: string | number): Promise<ClientFile[]> {
    try {
      const clientIdStr = typeof clientId === 'number' ? clientId.toString() : clientId;
      const paddedClientId = clientIdStr.padStart(4, '0');
      
      console.log(`📁 Fetching client files for client ${paddedClientId}`);
      const [rows] = await this.pool.execute(
        'SELECT * FROM client_files WHERE client_id = ? ORDER BY upload_date DESC',
        [paddedClientId]
      );
      
      console.log(`📁 Found ${(rows as any[]).length} files for client ${paddedClientId}`);
      
      return (rows as any[]).map(file => ({
        id: file.id,
        clientId: parseInt(file.client_id),
        fileName: file.file_name,
        originalFileName: file.original_file_name,
        fileSize: file.file_size,
        mimeType: file.mime_type,
        description: file.description,
        filePath: file.file_path,
        uploadDate: file.upload_date,
        uploadedByType: file.uploaded_by_type || 'client',
        createdAt: file.created_at,
      }));
    } catch (error) {
      console.error('Error getting client files:', error);
      throw error;
    }
  }

  async createClientFile(insertClientFile: InsertClientFile): Promise<ClientFile> {
    try {
      if (!insertClientFile.clientId) {
        throw new Error('Client ID is required for file upload');
      }

      const id = this.generateUUID();
      const clientIdStr = insertClientFile.clientId.toString().padStart(4, '0');
      const uploadDate = new Date();
      
      console.log(`📁 Creating new client file: ${insertClientFile.originalFileName} for client ${clientIdStr}`);
      
      const uploadedByType = (insertClientFile as any).uploadedByType || 'client';

      await this.pool.execute(`
        INSERT INTO client_files (
          id, client_id, file_name, original_file_name, file_size, 
          mime_type, description, file_path, upload_date, uploaded_by_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        clientIdStr,
        insertClientFile.fileName,
        insertClientFile.originalFileName,
        insertClientFile.fileSize,
        insertClientFile.mimeType,
        insertClientFile.description || null,
        insertClientFile.filePath,
        uploadDate,
        uploadedByType,
        new Date()
      ]);
      
      console.log(`✅ Successfully created client file record with ID: ${id}`);

      return {
        id,
        clientId: insertClientFile.clientId,
        fileName: insertClientFile.fileName,
        originalFileName: insertClientFile.originalFileName,
        fileSize: insertClientFile.fileSize,
        mimeType: insertClientFile.mimeType,
        description: insertClientFile.description || null,
        filePath: insertClientFile.filePath,
        uploadDate,
        uploadedByType: uploadedByType,
        createdAt: new Date(),
      };
    } catch (error) {
      console.error('Error creating client file:', error);
      throw error;
    }
  }

  async deleteClientFile(fileId: string): Promise<boolean> {
    try {
      const [result] = await this.pool.execute(
        'DELETE FROM client_files WHERE id = ?',
        [fileId]
      );
      return (result as any).affectedRows > 0;
    } catch (error) {
      console.error('Error deleting client file:', error);
      throw error;
    }
  }

  // Message methods
  async getMessage(messageId: string): Promise<Message | undefined> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM messages WHERE id = ?',
        [messageId]
      );
      const row = (rows as any)[0];
      if (!row) return undefined;

      return {
        id: row.id,
        clientId: parseInt(row.client_id),
        senderRole: row.sender_role,
        messageContent: row.message_content,
        isRead: row.is_read,
        createdAt: row.created_at,
      };
    } catch (error) {
      console.error('Error getting message:', error);
      throw error;
    }
  }

  async getClientMessages(clientId: string | number): Promise<Message[]> {
    try {
      const clientIdStr = typeof clientId === 'string' ? clientId : clientId.toString();
      const paddedClientId = clientIdStr.padStart(4, '0');
      
      const [rows] = await this.pool.execute(
        'SELECT * FROM messages WHERE client_id = ? ORDER BY created_at ASC',
        [paddedClientId]
      );
      
      return (rows as any[]).map(row => ({
        id: row.id,
        clientId: parseInt(row.client_id),
        senderRole: row.sender_role,
        messageContent: row.message_content,
        isRead: row.is_read,
        createdAt: row.created_at,
      }));
    } catch (error) {
      console.error('Error getting client messages:', error);
      throw error;
    }
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    try {
      const id = this.generateUUID();
      const clientIdStr = insertMessage.clientId.toString().padStart(4, '0');
      const createdAt = new Date();
      
      await this.pool.execute(`
        INSERT INTO messages (id, client_id, sender_role, message_content, is_read, created_at)
        VALUES (?, ?, ?, ?, 'false', ?)
      `, [
        id,
        clientIdStr,
        insertMessage.senderRole,
        insertMessage.messageContent,
        createdAt
      ]);

      return {
        id,
        clientId: insertMessage.clientId,
        senderRole: insertMessage.senderRole,
        messageContent: insertMessage.messageContent,
        isRead: 'false',
        createdAt,
      };
    } catch (error) {
      console.error('Error creating message:', error);
      throw error;
    }
  }

  async markMessageAsRead(messageId: string): Promise<boolean> {
    try {
      const [result] = await this.pool.execute(
        'UPDATE messages SET is_read = ? WHERE id = ?',
        ['true', messageId]
      );
      return (result as any).affectedRows > 0;
    } catch (error) {
      console.error('Error marking message as read:', error);
      throw error;
    }
  }

  async getUnreadMessageCount(clientId: string | number): Promise<number> {
    try {
      const clientIdStr = typeof clientId === 'string' ? clientId : clientId.toString();
      const paddedClientId = clientIdStr.padStart(4, '0');
      
      const [rows] = await this.pool.execute(
        'SELECT COUNT(*) as count FROM messages WHERE client_id = ? AND is_read = ?',
        [paddedClientId, 'false']
      );
      
      return (rows as any)[0].count || 0;
    } catch (error) {
      console.error('Error getting unread message count:', error);
      throw error;
    }
  }

}