/**
 * Recria os dados de demonstração. Execução: npm run db:seed  (APAGA os dados existentes!)
 */
import { PrismaClient } from "@prisma/client";
import { seedDemo } from "../src/lib/seed/demo";

const prisma = new PrismaClient();

seedDemo(prisma, { password: process.env.SEED_PASSWORD || "arqueatec123", log: (m) => console.log(m) })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
