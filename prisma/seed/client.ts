import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

export function createSeedClient() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL / DIRECT_URL belum diisi.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
