import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./shared/schema.ts",  out: "./drizzle",
  dialect: "mysql",                
  dbCredentials: {
    url: process.env.SINGLESTORE_URL!, 
  },
});
