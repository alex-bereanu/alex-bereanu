import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "@/config/env";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const connectionString =
    env.DATABASE_URL ?? "postgresql://not-configured:not-configured@localhost:5432/not-configured";
  return new PrismaClient({ adapter: new PrismaPg(connectionString) });
}

const prisma = global.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export { prisma };
