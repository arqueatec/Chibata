import "server-only";
import { prisma } from "@/lib/db";
import { visibleWhere, type Access } from "@/lib/authz";
import { isAdmin } from "@/lib/domain/access";

/** Opções de formulário de tarefas limitadas ao que o usuário pode atribuir. */
export async function taskFormOptions(access: Access) {
  const assignable = isAdmin(access.ctx)
    ? undefined
    : { in: [access.user.id, ...(access.user.role === "COORDINATOR" ? access.ctx.subordinates : [])] };
  const [people, projects, goals] = await Promise.all([
    prisma.user.findMany({ where: { active: true, id: assignable }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { active: true }, select: { id: true, name: true, kind: true }, orderBy: { name: "asc" } }),
    prisma.task.findMany({ where: { kind: "GOAL", status: { not: "DONE" }, assigneeId: visibleWhere(access) }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
  ]);
  return { people, projects, goals };
}
