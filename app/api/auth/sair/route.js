// Logout: apaga o cookie de sessão (Max-Age=0). O token é stateless
// (assinado, sem tabela), então "sair" é simplesmente descartar o cookie.

import { COOKIE_SESSAO } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": `${COOKIE_SESSAO}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`,
      },
    }
  );
}
