import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, json, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  role: text("role").notNull().default("client"),
  createdAt: timestamp("created_at").defaultNow(),
});

// PostgreSQL clients table structure
export const clients = pgTable("clients", {
  clientId: serial("client_id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  nationalId: varchar("national_id", { length: 10 }).notNull().unique(),
  phoneNumbers: json("phone_numbers").notNull(),
  password: text("password"), // Add password field for authentication
  createdAt: timestamp("created_at").defaultNow(),
});

// PostgreSQL cases table structure  
export const cases = pgTable("cases", {
  caseId: serial("case_id").primaryKey(),
  clientId: serial("client_id").notNull(),
  caseCreationDate: timestamp("case_creation_date").defaultNow(),
  lastCaseStatus: text("last_case_status").notNull().default("pending"),
  lastStatusDate: timestamp("last_status_date").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// PostgreSQL case_events table structure
export const caseEvents = pgTable("Case_Events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  caseId: varchar("case_id", { length: 7 }).notNull(),
  eventType: text("event_type").notNull(),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Client files table for document uploads
export const clientFiles = pgTable("client_files", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  clientId: serial("client_id").notNull(),
  fileName: text("file_name").notNull(),
  originalFileName: text("original_file_name").notNull(),
  fileSize: text("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  description: text("description"),
  uploadDate: timestamp("upload_date").defaultNow(),
  filePath: text("file_path").notNull(),
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
