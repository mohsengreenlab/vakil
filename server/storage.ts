import { type User, type InsertUser, type LegalCase, type InsertLegalCase, type Contact, type InsertContact } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Legal case methods
  getLegalCase(id: string): Promise<LegalCase | undefined>;
  getAllLegalCases(): Promise<LegalCase[]>;
  createLegalCase(legalCase: InsertLegalCase): Promise<LegalCase>;
  updateLegalCaseStatus(id: string, status: string): Promise<LegalCase | undefined>;
  
  // Contact methods
  getContact(id: string): Promise<Contact | undefined>;
  getAllContacts(): Promise<Contact[]>;
  createContact(contact: InsertContact): Promise<Contact>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private legalCases: Map<string, LegalCase>;
  private contacts: Map<string, Contact>;

  constructor() {
    this.users = new Map();
    this.legalCases = new Map();
    this.contacts = new Map();
    
    // Create default admin user
    const adminId = randomUUID();
    const admin: User = {
      id: adminId,
      username: "admin",
      password: "admin123", // In production, this should be hashed
      email: "admin@pishrolawfirm.ir",
      role: "admin",
      createdAt: new Date(),
    };
    this.users.set(adminId, admin);
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      id,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async getLegalCase(id: string): Promise<LegalCase | undefined> {
    return this.legalCases.get(id);
  }

  async getAllLegalCases(): Promise<LegalCase[]> {
    return Array.from(this.legalCases.values()).sort(
      (a, b) => b.createdAt!.getTime() - a.createdAt!.getTime()
    );
  }

  async createLegalCase(insertLegalCase: InsertLegalCase): Promise<LegalCase> {
    const id = randomUUID();
    const legalCase: LegalCase = {
      ...insertLegalCase,
      id,
      status: "pending",
      createdAt: new Date(),
    };
    this.legalCases.set(id, legalCase);
    return legalCase;
  }

  async updateLegalCaseStatus(id: string, status: string): Promise<LegalCase | undefined> {
    const legalCase = this.legalCases.get(id);
    if (legalCase) {
      legalCase.status = status;
      this.legalCases.set(id, legalCase);
      return legalCase;
    }
    return undefined;
  }

  async getContact(id: string): Promise<Contact | undefined> {
    return this.contacts.get(id);
  }

  async getAllContacts(): Promise<Contact[]> {
    return Array.from(this.contacts.values()).sort(
      (a, b) => b.createdAt!.getTime() - a.createdAt!.getTime()
    );
  }

  async createContact(insertContact: InsertContact): Promise<Contact> {
    const id = randomUUID();
    const contact: Contact = {
      ...insertContact,
      id,
      createdAt: new Date(),
    };
    this.contacts.set(id, contact);
    return contact;
  }
}

export const storage = new MemStorage();
