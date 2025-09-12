import { type User, type InsertUser, type Client, type InsertClient, type Case, type InsertCase, type Contact, type InsertContact } from "@shared/schema";
import { type QAItem, type InsertQAItem } from "./singlestore.js";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Client methods
  getClient(clientId: string | number): Promise<Client | undefined>;
  getAllClients(): Promise<Client[]>;
  createClient(firstName: string, lastName: string, nationalId: string, phoneNumbers: string[], password?: string): Promise<Client>;
  authenticateClient(nationalId: string, password: string): Promise<Client | null>;
  updateClientPassword(clientId: string, newPassword: string): Promise<void>;
  setClientPasswordByNationalId(nationalId: string, password: string): Promise<void>;
  getClientCases(clientId: string): Promise<Case[]>;
  
  // Case methods
  getCase(caseId: string | number): Promise<Case | undefined>;
  getAllCases(): Promise<Case[]>;
  createCase(clientId: string | number, status: string, caseId?: string): Promise<Case>;
  updateCaseStatus(caseId: string | number, status: string): Promise<Case | undefined>;
  
  // Contact methods
  getContact(id: string): Promise<Contact | undefined>;
  getAllContacts(): Promise<Contact[]>;
  createContact(contact: InsertContact): Promise<Contact>;
  
  // QA methods
  getPublicQAItems(): Promise<QAItem[]>;
  getAllQAItems(): Promise<QAItem[]>;
  createQAItem(qaData: InsertQAItem): Promise<QAItem>;
  updateQAItem(id: string, qaData: Partial<InsertQAItem>): Promise<QAItem | null>;
  deleteQAItem(id: string): Promise<boolean>;
  getQAItem(id: string): Promise<QAItem | null>;
  
  // Legacy methods for backward compatibility
  getAllLegalCases(): Promise<any[]>;
  createLegalCase(caseData: any): Promise<any>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private clients: Map<number, Client>;
  private cases: Map<number, Case>;
  private contacts: Map<string, Contact>;
  private nextClientId: number = 1000; // Start client IDs from 1000
  private nextCaseId: number = 1000000; // Start case IDs from 1000000

  constructor() {
    this.users = new Map();
    this.clients = new Map();
    this.cases = new Map();
    this.contacts = new Map();
    
    // Create default admin user with hashed password
    const adminId = randomUUID();
    const hashedPassword = bcrypt.hashSync("admin123", 10);
    const admin: User = {
      id: adminId,
      username: "admin",
      password: hashedPassword,
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
      role: insertUser.role || "client",
      createdAt: new Date(),
      email: insertUser.email || null,
    };
    this.users.set(id, user);
    return user;
  }

  // Client methods
  async getClient(clientId: number): Promise<Client | undefined> {
    return this.clients.get(clientId);
  }

  async getAllClients(): Promise<Client[]> {
    return Array.from(this.clients.values()).sort(
      (a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
    );
  }

  async createClient(firstName: string, lastName: string, nationalId: string, phoneNumbers: string[], password?: string): Promise<Client> {
    const clientId = this.nextClientId++;
    const client: Client = {
      clientId,
      firstName,
      lastName,
      nationalId,
      phoneNumbers,
      createdAt: new Date(),
    };
    this.clients.set(clientId, client);
    return client;
  }

  // Case methods
  async getCase(caseId: string | number): Promise<Case | undefined> {
    const numericCaseId = typeof caseId === 'string' ? parseInt(caseId) : caseId;
    return this.cases.get(numericCaseId);
  }

  async getAllCases(): Promise<Case[]> {
    return Array.from(this.cases.values()).sort(
      (a, b) => (b.caseCreationDate?.getTime() || 0) - (a.caseCreationDate?.getTime() || 0)
    );
  }

  async createCase(clientId: string | number, status: string, caseId?: string): Promise<Case> {
    const numericClientId = typeof clientId === 'string' ? parseInt(clientId) : clientId;
    const numericCaseId = caseId ? parseInt(caseId) : this.nextCaseId++;
    const case_: Case = {
      caseId: numericCaseId,
      clientId: numericClientId,
      lastCaseStatus: status,
      caseCreationDate: new Date(),
      lastStatusDate: new Date(),
    };
    this.cases.set(numericCaseId, case_);
    return case_;
  }

  async updateCaseStatus(caseId: string | number, status: string): Promise<Case | undefined> {
    const numericCaseId = typeof caseId === 'string' ? parseInt(caseId) : caseId;
    const case_ = this.cases.get(numericCaseId);
    if (case_) {
      case_.lastCaseStatus = status;
      case_.lastStatusDate = new Date();
      this.cases.set(numericCaseId, case_);
      return case_;
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
      email: insertContact.email || null,
      createdAt: new Date(),
    };
    this.contacts.set(id, contact);
    return contact;
  }

  // QA methods (stub implementations for MemStorage)
  async getPublicQAItems(): Promise<QAItem[]> {
    return [];
  }

  async getAllQAItems(): Promise<QAItem[]> {
    return [];
  }

  async createQAItem(qaData: InsertQAItem): Promise<QAItem> {
    const id = randomUUID();
    return {
      id,
      question: qaData.question,
      answer: qaData.answer,
      topic: qaData.topic,
      show: qaData.show,
      date_created: new Date()
    };
  }

  async updateQAItem(id: string, qaData: Partial<InsertQAItem>): Promise<QAItem | null> {
    return null;
  }

  async deleteQAItem(id: string): Promise<boolean> {
    return false;
  }

  async getQAItem(id: string): Promise<QAItem | null> {
    return null;
  }

  // Legacy interface methods for backward compatibility
  async getAllLegalCases(): Promise<any[]> {
    // For now, return empty array since we don't have legacy cases structure
    return [];
  }

  async createLegalCase(caseData: any): Promise<any> {
    // For now, just log and return a mock response
    console.log('Legacy case creation:', caseData);
    return { id: randomUUID(), ...caseData, status: 'pending', createdAt: new Date() };
  }
}

export const storage = new MemStorage();
