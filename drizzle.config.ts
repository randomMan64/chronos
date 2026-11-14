import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://neondb_owner:password@ep-sample-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require",
  },
});

