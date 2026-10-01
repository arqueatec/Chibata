import { NextResponse, type NextRequest } from "next/server";

// Verificação otimista (apenas presença do cookie). A validação real da sessão
// e a autorização acontecem no servidor, em cada página e server action.
const PUBLIC = ["/login", "/auth/magic", "/api/cron", "/manifest.webmanifest", "/setup"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("arq_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
