import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma CLI (migrate, studio) needs a direct/session connection.
// On Supabase use the session pooler (port 5432) or the direct host for DIRECT_URL,
// and the transaction pooler (port 6543) for DATABASE_URL used by the app at runtime.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed/base.ts",
  },
  datasource: { url },
});
