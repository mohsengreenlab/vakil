import { sql } from "drizzle-orm";
import { mysqlTable, text, varchar, timestamp, json, int, boolean } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  role: varchar("role", { length: 50 }).notNull().default("client"),
  createdAt: timestamp("created_at").defaultNow(),
});

// MySQL clients table structure
export const clients = mysqlTable("clients", {
  clientId: int("client_id").primaryKey().autoincrement(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  nationalId: varchar("national_id", { length: 10 }).notNull().unique(),
  phoneNumbers: json("phone_numbers").notNull(),
  password: varchar("password", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// MySQL cases table structure
export const cases = mysqlTable("cases", {
  caseId: int("case_id").primaryKey().autoincrement(),
  clientId: int("client_id").notNull(),
  caseCreationDate: timestamp("case_creation_date").defaultNow(),
  lastCaseStatus: varchar("last_case_status", { length: 255 }).notNull().default("pending"),
  lastStatusDate: timestamp("last_status_date").defaultNow(),
  closed: boolean("closed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// MySQL case_events table structure
export const caseEvents = mysqlTable("Case_Events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  caseId: varchar("case_id", { length: 7 }).notNull(),
  eventType: text("event_type").notNull(),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const contacts = mysqlTable("contacts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  email: varchar("email", { length: 255 }),
  subject: varchar("subject", { length: 500 }).notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Client files table for document uploads
export const clientFiles = mysqlTable("client_files", {
  id: varchar("id", { length: 36 }).primaryKey(),
  clientId: int("client_id").notNull(),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  originalFileName: varchar("original_file_name", { length: 500 }).notNull(),
  fileSize: varchar("file_size", { length: 20 }).notNull(),
  mimeType: varchar("mime_type", { length: 255 }).notNull(),
  description: text("description"),
  uploadDate: timestamp("upload_date").defaultNow(),
  filePath: varchar("file_path", { length: 1000 }).notNull(),
  uploadedByType: varchar("uploaded_by_type", { length: 10 }).notNull().default("client"),
  adminViewed: boolean("admin_viewed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Messages table for admin-client communication
export const messages = mysqlTable("messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  clientId: int("client_id").notNull(),
  senderRole: varchar("sender_role", { length: 10 }).notNull(),
  messageContent: text("message_content").notNull(),
  isRead: varchar("is_read", { length: 5 }), // NULL for admin messages, 'true'/'false' for client messages
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  role: true,
});

export const insertClientSchema = createInsertSchema(clients).pick({
  firstName: true,
  lastName: true,
  nationalId: true,
  phoneNumbers: true,
});

export const insertCaseSchema = createInsertSchema(cases).pick({
  clientId: true,
  lastCaseStatus: true,
  closed: true,
});

export const insertContactSchema = createInsertSchema(contacts).pick({
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  subject: true,
  message: true,
});

export const insertCaseEventSchema = createInsertSchema(caseEvents).pick({
  caseId: true,
  eventType: true,
  details: true,
});

// Schema for form data validation (without caseId since it comes from URL params)
export const caseEventFormSchema = createInsertSchema(caseEvents).pick({
  eventType: true,
  details: true,
});

export const insertClientFileSchema = createInsertSchema(clientFiles).pick({
  clientId: true,
  fileName: true,
  originalFileName: true,
  fileSize: true,
  mimeType: true,
  description: true,
  filePath: true,
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  clientId: true,
  senderRole: true,
  messageContent: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof cases.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;
export type InsertCaseEvent = z.infer<typeof insertCaseEventSchema>;
export type CaseEvent = typeof caseEvents.$inferSelect;
export type InsertClientFile = z.infer<typeof insertClientFileSchema>;
export type ClientFile = typeof clientFiles.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
