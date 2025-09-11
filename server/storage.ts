import { type User, type InsertUser, type Client, type InsertClient, type Case, type InsertCase, type Contact, type InsertContact } from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Client methods
  getClient(clientId: number): Promise<Client | undefined>;
  getAllClients(): Promise<Client[]>;
  createClient(firstName: string, lastName: string, nationalId: string, phoneNumbers: string[]): Promise<Client>;
  
  // Case methods
  getCase(caseId: number): Promise<Case | undefined>;
  getAllCases(): Promise<Case[]>;
  createCase(clientId: number, status: string): Promise<Case>;
  updateCaseStatus(caseId: number, status: string): Promise<Case | undefined>;
  
  // Contact methods
  getContact(id: string): Promise<Contact | undefined>;
  getAllContacts(): Promise<Contact[]>;
  createContact(contact: InsertContact): Promise<Contact>;
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

  async createClient(firstName: string, lastName: string, nationalId: string, phoneNumbers: string[]): Promise<Client> {
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
  async getCase(caseId: number): Promise<Case | undefined> {
    return this.cases.get(caseId);
  }

  async getAllCases(): Promise<Case[]> {
    return Array.from(this.cases.values()).sort(
      (a, b) => (b.caseCreationDate?.getTime() || 0) - (a.caseCreationDate?.getTime() || 0)
    );
  }

  async createCase(clientId: number, status: string): Promise<Case> {
    const caseId = this.nextCaseId++;
    const case_: Case = {
      caseId,
      clientId,
      lastCaseStatus: status,
      caseCreationDate: new Date(),
      lastStatusDate: new Date(),
    };
    this.cases.set(caseId, case_);
    return case_;
  }

  async updateCaseStatus(caseId: number, status: string): Promise<Case | undefined> {
    const case_ = this.cases.get(caseId);
    if (case_) {
      case_.lastCaseStatus = status;
      case_.lastStatusDate = new Date();
      this.cases.set(caseId, case_);
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
}

export const storage = new MemStorage();
