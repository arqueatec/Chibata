import "server-only";
import { prisma } from "@/lib/db";

/** Indicadores aplicáveis a uma pessoa: os da sua área + os pessoais. */
export async function indicatorsForUser(userId: string, includeInactive = false) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { areaId: true } });
  return prisma.indicator.findMany({
    where: {
      ...(includeInactive ? {} : { active: true }),
      OR: [{ ownerId: userId }, ...(user.areaId ? [{ areaId: user.areaId, ownerId: null }] : [])],
    },
    orderBy: [{ ownerId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}
