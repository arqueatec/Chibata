import "server-only";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * Envia e-mail via API HTTP da Resend (sem SDK). Retorna false se não configurado.
 * Em desenvolvimento sem configuração, o conteúdo é registrado no log do servidor.
 */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  if (!emailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email:dev] Para: ${msg.to}\nAssunto: ${msg.subject}\n${msg.text}`);
    }
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
  });
  if (!res.ok) {
    console.error("[email] falha no envio", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}

export function appUrl() {
  return (process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")).replace(/\/$/, "");
}
