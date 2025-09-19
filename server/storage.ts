import { type User, type InsertUser, type Client, type InsertClient, type Case, type InsertCase, type Contact, type InsertContact, type CaseEvent, type InsertCaseEvent, type ClientFile, type InsertClientFile, type Message, type InsertMessage } from "@shared/schema";
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
  
  // Case Events methods
  getCaseEvents(caseId: string | number): Promise<CaseEvent[]>;
  getClientCaseEvents(clientId: string | number): Promise<{ case: Case, events: CaseEvent[] }[]>;
  createCaseEvent(caseEvent: InsertCaseEvent): Promise<CaseEvent>;
  updateCaseEvent(eventId: string, updates: Partial<InsertCaseEvent>): Promise<CaseEvent | null>;
  deleteCaseEvent(eventId: string): Promise<boolean>;
  syncAllCaseStatuses(): Promise<void>;
  
  // Contact methods
  getContact(id: string): Promise<Contact | undefined>;
  getAllContacts(): Promise<Contact[]>;
  createContact(contact: InsertContact): Promise<Contact>;
  
  // Client File methods
  getClientFile(fileId: string): Promise<ClientFile | undefined>;
  getClientFiles(clientId: string | number): Promise<ClientFile[]>;
  createClientFile(clientFile: InsertClientFile): Promise<ClientFile>;
  deleteClientFile(fileId: string): Promise<boolean>;
  
  // Message methods
  getMessage(messageId: string): Promise<Message | undefined>;
  getClientMessages(clientId: string | number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  markMessageAsRead(messageId: string): Promise<boolean>;
  markAllClientMessagesAsRead(clientId: string | number): Promise<number>;
  getUnreadMessageCount(clientId: string | number): Promise<number>;
  
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
  private caseEvents: Map<string, CaseEvent>;
  private clientFiles: Map<string, ClientFile>;
  private messages: Map<string, Message>;
  private nextClientId: number = 1000; // Start client IDs from 1000
  private nextCaseId: number = 1000000; // Start case IDs from 1000000

  constructor() {
    this.users = new Map();
    this.clients = new Map();
    this.cases = new Map();
    this.contacts = new Map();
    this.caseEvents = new Map();
    this.clientFiles = new Map();
    this.messages = new Map();
    
    // SECURITY FIX: Only create admin user if ADMIN_PASSWORD environment variable is set
    // This removes the hardcoded "admin123" password vulnerability
    if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 8) {
      const adminId = randomUUID();
      const hashedPassword = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
      const admin: User = {
        id: adminId,
        username: "admin",
        password: hashedPassword,
        email: "admin@pishrolawfirm.ir", 
        role: "admin",
        createdAt: new Date(),
      };
      this.users.set(adminId, admin);
      console.log("✅ Admin user created with environment-provided password");
    } else {
      console.log("⚠️  No admin user created - set ADMIN_PASSWORD environment variable (min 8 chars) to create admin user");
    }
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
    const hashedPassword = password ? bcrypt.hashSync(password, 10) : null;
    const client: Client = {
      clientId,
      firstName,
      lastName,
      nationalId,
      phoneNumbers,
      password: hashedPassword,
      createdAt: new Date(),
    };
    this.clients.set(clientId, client);
    return client;
  }

  async authenticateClient(nationalId: string, password: string): Promise<Client | null> {
    const client = Array.from(this.clients.values()).find(c => c.nationalId === nationalId);
    if (!client || !client.password) {
      return null;
    }
    const isValid = bcrypt.compareSync(password, client.password);
    return isValid ? client : null;
  }

  async updateClientPassword(clientId: string, newPassword: string): Promise<void> {
    const numericClientId = parseInt(clientId);
    const client = this.clients.get(numericClientId);
    if (client) {
      client.password = bcrypt.hashSync(newPassword, 10);
      this.clients.set(numericClientId, client);
    }
  }

  async setClientPasswordByNationalId(nationalId: string, password: string): Promise<void> {
    const client = Array.from(this.clients.values()).find(c => c.nationalId === nationalId);
    if (client) {
      client.password = bcrypt.hashSync(password, 10);
      this.clients.set(client.clientId, client);
    }
  }

  async getClientCases(clientId: string): Promise<Case[]> {
    const numericClientId = parseInt(clientId);
    return Array.from(this.cases.values()).filter(case_ => case_.clientId === numericClientId);
  }

  // Case methods
  async getCase(caseId: string | number): Promise<Case | undefined> {
    const numericCaseId = typeof caseId === 'string' ? parseInt(caseId) : caseId;
    return this.cases.get(numericCaseId);
  }

  async getAllCases(): Promise<Case[]> {
    const allCases = Array.from(this.cases.values());
    
    // For each case, get the latest status from case events
    const casesWithLatestStatus = await Promise.all(
      allCases.map(async (case_) => {
        const caseEvents = await this.getCaseEvents(case_.caseId);
        // Get the most recent event's eventType as the current status
        const latestStatus = caseEvents.length > 0 ? caseEvents[0].eventType : case_.lastCaseStatus;
        
        return {
          ...case_,
          lastCaseStatus: latestStatus
        };
      })
    );
    
    return casesWithLatestStatus.sort(
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
      createdAt: new Date(),
    };
    this.cases.set(numericCaseId, case_);
    return case_;
  }


  // Case Events methods
  async getCaseEvents(caseId: string | number): Promise<CaseEvent[]> {
    const caseIdStr = caseId.toString();
    return Array.from(this.caseEvents.values())
      .filter(event => event.caseId === caseIdStr)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  }

  // Sync function to update cases.last_case_status with latest event
  private async syncCaseStatus(caseId: string | number): Promise<void> {
    const caseIdStr = caseId.toString();
    const numericCaseId = typeof caseId === 'string' ? parseInt(caseId) : caseId;
    
    const events = await this.getCaseEvents(caseId);
    const latestEventType = events.length > 0 ? events[0].eventType : null;
    
    const case_ = this.cases.get(numericCaseId);
    if (case_) {
      case_.lastCaseStatus = latestEventType || 'pending'; // Default to 'pending' if null
      case_.lastStatusDate = new Date();
      this.cases.set(numericCaseId, case_);
      console.log(`🔄 Synced case ${caseId} status to: ${latestEventType || 'NULL'}`);
    }
  }

  // Bulk sync all cases - useful for maintenance  
  async syncAllCaseStatuses(): Promise<void> {
    console.log('🔄 Starting bulk sync of all case statuses...');
    
    const allCases = Array.from(this.cases.values());
    
    for (const case_ of allCases) {
      await this.syncCaseStatus(case_.caseId);
    }
    
    console.log(`✅ Completed bulk sync for ${allCases.length} cases`);
  }

  async getClientCaseEvents(clientId: string | number): Promise<{ case: Case, events: CaseEvent[] }[]> {
    const numericClientId = typeof clientId === 'string' ? parseInt(clientId) : clientId;
    const clientCases = Array.from(this.cases.values()).filter(case_ => case_.clientId === numericClientId);
    
    const result = [];
    for (const case_ of clientCases) {
      const events = await this.getCaseEvents(case_.caseId);
      result.push({ case: case_, events });
    }
    
    return result;
  }

  async createCaseEvent(caseEvent: InsertCaseEvent): Promise<CaseEvent> {
    const id = randomUUID();
    const newEvent: CaseEvent = {
      id,
      caseId: caseEvent.caseId,
      eventType: caseEvent.eventType,
      occurredAt: new Date(),
      details: caseEvent.details || null,
      createdAt: new Date(),
    };
    this.caseEvents.set(id, newEvent);
    
    // Sync the case status after creating the event
    await this.syncCaseStatus(caseEvent.caseId);
    
    return newEvent;
  }

  async updateCaseEvent(eventId: string, updates: Partial<InsertCaseEvent>): Promise<CaseEvent | null> {
    const event = this.caseEvents.get(eventId);
    if (!event) {
      return null;
    }

    if (updates.eventType !== undefined) {
      event.eventType = updates.eventType;
    }
    if (updates.details !== undefined) {
      event.details = updates.details;
    }

    this.caseEvents.set(eventId, event);
    
    // Sync the case status after updating the event
    await this.syncCaseStatus(event.caseId);
    
    return event;
  }

  async deleteCaseEvent(eventId: string): Promise<boolean> {
    const event = this.caseEvents.get(eventId);
    if (!event) {
      return false;
    }
    
    const caseId = event.caseId;
    const deleted = this.caseEvents.delete(eventId);
    
    // Sync the case status after deleting the event
    if (deleted) {
      await this.syncCaseStatus(caseId);
    }
    
    return deleted;
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

  // Client File methods
  async getClientFile(fileId: string): Promise<ClientFile | undefined> {
    return this.clientFiles.get(fileId);
  }

  async getClientFiles(clientId: string | number): Promise<ClientFile[]> {
    const numericClientId = typeof clientId === 'string' ? parseInt(clientId) : clientId;
    return Array.from(this.clientFiles.values())
      .filter(file => file.clientId === numericClientId)
      .sort((a, b) => b.uploadDate!.getTime() - a.uploadDate!.getTime());
  }

  async createClientFile(insertClientFile: InsertClientFile): Promise<ClientFile> {
    if (!insertClientFile.clientId) {
      throw new Error('Client ID is required for file upload');
    }
    
    const id = randomUUID();
    const clientFile: ClientFile = {
      id,
      clientId: insertClientFile.clientId,
      fileName: insertClientFile.fileName,
      originalFileName: insertClientFile.originalFileName,
      fileSize: insertClientFile.fileSize,
      mimeType: insertClientFile.mimeType,
      description: insertClientFile.description || null,
      filePath: insertClientFile.filePath,
      uploadedByType: 'client',
      uploadDate: new Date(),
      createdAt: new Date(),
    };
    this.clientFiles.set(id, clientFile);
    return clientFile;
  }

  async deleteClientFile(fileId: string): Promise<boolean> {
    return this.clientFiles.delete(fileId);
  }

  // Message methods
  async getMessage(messageId: string): Promise<Message | undefined> {
    return this.messages.get(messageId);
  }

  async getClientMessages(clientId: string | number): Promise<Message[]> {
    const numericClientId = typeof clientId === 'string' ? parseInt(clientId) : clientId;
    return Array.from(this.messages.values())
      .filter(message => message.clientId === numericClientId)
      .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime()); // Oldest first for conversation order
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    // Set is_read based on sender role: NULL for admin, 'false' for client
    const isReadValue = insertMessage.senderRole === 'admin' ? null : 'false';
    const message: Message = {
      id,
      clientId: insertMessage.clientId,
      senderRole: insertMessage.senderRole,
      messageContent: insertMessage.messageContent,
      isRead: isReadValue,
      createdAt: new Date(),
    };
    this.messages.set(id, message);
    return message;
  }

  async markMessageAsRead(messageId: string): Promise<boolean> {
    const message = this.messages.get(messageId);
    if (!message) {
      return false;
    }
    // Only mark client messages as read (admin messages should remain NULL)
    if (message.senderRole === 'client') {
      message.isRead = 'true';
      this.messages.set(messageId, message);
      return true;
    }
    return false; // Don't mark admin messages as read
  }

  async markAllClientMessagesAsRead(clientId: string | number): Promise<number> {
    const numericClientId = typeof clientId === 'string' ? parseInt(clientId) : clientId;
    let markedCount = 0;
    
    // Find all unread client messages for this client and mark them as read
    for (const [messageId, message] of this.messages) {
      if (message.clientId === numericClientId && 
          message.senderRole === 'client' && 
          message.isRead === 'false') {
        message.isRead = 'true';
        this.messages.set(messageId, message);
        markedCount++;
      }
    }
    
    return markedCount;
  }

  async getUnreadMessageCount(clientId: string | number): Promise<number> {
    const numericClientId = typeof clientId === 'string' ? parseInt(clientId) : clientId;
    // Only count unread client messages (admin messages have NULL is_read and shouldn't be counted)
    return Array.from(this.messages.values())
      .filter(message => message.clientId === numericClientId && message.senderRole === 'client' && message.isRead === 'false')
      .length;
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
