import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Optional: only needed for CLI commands (db push, migrate, etc.)
    // prisma generate works without a database connection
    url: process.env.DATABASE_URL ?? "",
  },
});
