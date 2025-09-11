import { sql } from "drizzle-orm";
import { mysqlTable, text, varchar, timestamp, json, int } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  role: text("role").notNull().default("client"),
  createdAt: timestamp("created_at").defaultNow(),
});

// SingleStore clients table structure
export const clients = mysqlTable("clients", {
  clientId: int("client_id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  nationalId: varchar("national_id", { length: 10 }).notNull().unique(),
  phoneNumbers: json("phone_numbers").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// SingleStore cases table structure  
export const cases = mysqlTable("cases", {
  caseId: int("case_id").primaryKey(),
  clientId: int("client_id").notNull(),
  caseCreationDate: timestamp("case_creation_date").defaultNow(),
  lastCaseStatus: text("last_case_status").notNull().default("pending"),
  lastStatusDate: timestamp("last_status_date").defaultNow(),
});

export const contacts = mysqlTable("contacts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
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

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof cases.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;
