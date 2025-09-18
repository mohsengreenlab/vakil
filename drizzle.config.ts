import { defineConfig } from "drizzle-kit";

// For SingleStore/MySQL connection
if (!process.env.SINGLESTORE_PASSWORD) {
  throw new Error("SINGLESTORE_PASSWORD environment variable is required for SingleStore connection");
}

export default defineConfig({
  schema: "./shared/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: `singlestore://dew-7b1a1:${process.env.SINGLESTORE_PASSWORD}@svc-3482219c-a389-4079-b18b-d50662524e8a-shared-dml.aws-virginia-6.svc.singlestore.com:3333/db_dew_f1c43?ssl={}`
  },
});
