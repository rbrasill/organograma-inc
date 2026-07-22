// Guarda de autorização das rotas /api (runtime Node).
// O middleware protege as PÁGINAS por perfil; cada rota de API sensível chama
// exigirNivel() — defesa em profundidade: a API nega mesmo se alguém chamar
// direto por fetch/curl.
//
// INTERRUPTOR SEGURO: sem AUTH_SESSION_SECRET a autenticação está desligada
// (mesmo comportamento do middleware) — as guardas liberam tudo, para nunca
// trancar o administrador durante a configuração.

import { cookies } from "next/headers";
import { COOKIE_SESSAO, verificarSessao } from "@/lib/auth";
import { nivelDe } from "@/lib/perfis";

// sessão da request atual: { claims, nivel } | { desligada: true } | null
export function sessaoAtual() {
  if (!process.env.AUTH_SESSION_SECRET) return { desligada: true, nivel: Infinity };
  const token = cookies().get(COOKIE_SESSAO)?.value;
  const claims = verificarSessao(token);
  if (!claims) return null;
  return { claims, nivel: nivelDe(claims.perfil) };
}

// retorna uma Response de bloqueio (401/403) ou null quando pode seguir.
//   const bloqueio = exigirNivel(NIVEL.ADMIN); if (bloqueio) return bloqueio;
export function exigirNivel(minimo) {
  const s = sessaoAtual();
  if (s?.desligada) return null; // auth desligada = tudo liberado
  if (!s) {
    return Response.json(
      { ok: false, erro: "Não autenticado — faça login para continuar." },
      { status: 401 }
    );
  }
  if (s.nivel < minimo) {
    return Response.json(
      { ok: false, erro: "Seu perfil de acesso não permite esta ação." },
      { status: 403 }
    );
  }
  return null;
}
