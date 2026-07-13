// Sessão atual: o HeroNav usa para mostrar "Olá, Nome" + botão Sair só
// quando há alguém logado (e nada quando a autenticação está desligada).
//   GET → { ok, ativa (auth ligada?), autenticado, nome }

import { cookies } from "next/headers";
import { COOKIE_SESSAO, verificarSessao } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  // sem segredo configurado = autenticação desligada (mesmo interruptor
  // do middleware) — não há sessão para mostrar
  if (!process.env.AUTH_SESSION_SECRET) {
    return Response.json({ ok: true, ativa: false, autenticado: false, nome: "" });
  }
  const token = cookies().get(COOKIE_SESSAO)?.value;
  const sessao = verificarSessao(token);
  return Response.json({
    ok: true,
    ativa: true,
    autenticado: !!sessao,
    nome: sessao?.nome || "",
  });
}
