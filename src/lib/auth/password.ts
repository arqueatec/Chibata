import bcrypt from "bcryptjs";

export const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 11);
}

export function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  // Compara contra um hash fictício quando o usuário não tem senha, para tempo de resposta uniforme.
  return bcrypt.compare(plain, hash ?? "$2b$11$6j0eoY2PjgBmVSNd9T6R8.Hk.g/DKgUbRwwL9z3jwt4qkfPunbP..");
}
