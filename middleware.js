// Proteção de sessão de TODO o portal (páginas e APIs).
//
// INTERRUPTOR SEGURO: se AUTH_SESSION_SECRET não estiver definido no .env,
// o middleware deixa tudo passar (autenticação desligada) — assim configurar
// o login errado nunca tranca o administrador para fora. Para ATIVAR a
// proteção, basta definir AUTH_SESSION_SECRET (ver .env.example).
//
// Com a proteção ativa:
//   * página sem sessão válida  → redireciona para /login;
//   * API sem sessão válida     → 401 JSON (exceto /api/auth/*, que são
//     justamente as rotas de obter a sessão);
//   * /login com sessão válida  → redireciona para a home.
//
// O middleware roda no runtime Edge (sem o módulo "crypto" do Node), então a
// verificação do token usa Web Crypto — mesma assinatura HMAC-SHA256 do
// lib/auth.js (que continua sendo usado pelas rotas /api em Node).

import { NextResponse } from "next/server";

const COOKIE_SESSAO = "inc_sessao";

function b64urlParaStr(s) {
  let b = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4) b += "=";
  return atob(b);
}

async function verificarToken(token, segredo) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payload, assinatura] = token.split(".");
  try {
    const enc = new TextEncoder();
    const chave = await crypto.subtle.importKey(
      "raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", chave, enc.encode(payload));
    const esperada = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (esperada !== assinatura) return null;
    const dados = JSON.parse(b64urlParaStr(payload));
    if (!dados.exp || Date.now() > dados.exp) return null;
    return dados;
  } catch {
    return null;
  }
}

export async function middleware(req) {
  const segredo = process.env.AUTH_SESSION_SECRET;
  if (!segredo) return NextResponse.next(); // interruptor: auth desligada

  const { pathname } = req.nextUrl;

  // rotas de autenticação ficam sempre acessíveis (são a porta de entrada)
  if (pathname.startsWith("/api/auth/")) return NextResponse.next();

  const token = req.cookies.get(COOKIE_SESSAO)?.value;
  const sessao = await verificarToken(token, segredo);

  if (pathname === "/login") {
    // já logado não precisa ver o login de novo
    return sessao ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
  }

  if (!sessao) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, erro: "Não autenticado — faça login para continuar." },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

// tudo, exceto arquivos estáticos (logo, modelo de importação, ícones, build)
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|xlsx)).*)"],
};
