// Login passwordless — passo 1: solicitar o código.
//   POST { email } →
//     1. valida o domínio @meuinc.com.br (403 se outro domínio);
//     2. rate limit por e-mail: 1 código/minuto, 5/hora (429);
//     3. busca o colaborador ATIVO pelo e-mail — se não existir, responde o
//        MESMO 200 genérico sem enviar nada (anti-enumeração de e-mails);
//     4. invalida códigos anteriores, gera código novo (crypto), grava SÓ o
//        hash com expiração de 10 minutos;
//     5. manda o Pipedream entregar o e-mail ({ email, nome, codigo } +
//        header x-inc-secret). Falhou o envio → apaga o código e responde 500.
// O Pipedream é só o carteiro — geração e validação vivem aqui (MySQL).
// Requer no .env: PIPEDREAM_AUTH_URL e INC_AUTH_SECRET (ver .env.example).

import { randomUUID } from "crypto";
import { getPool } from "@/lib/db";
import { gerarCodigo, hashCodigo } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXPIRA_MIN = 10;
const RESPOSTA_GENERICA = {
  ok: true,
  mensagem: "Se o e-mail estiver cadastrado, você receberá o código em instantes.",
};

export async function POST(req) {
  try {
    const pool = getPool();
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ ok: false, erro: "Informe um e-mail válido." }, { status: 400 });
    }
    if (!email.endsWith("@meuinc.com.br")) {
      return Response.json(
        { ok: false, erro: "Use seu e-mail corporativo @meuinc.com.br." },
        { status: 403 }
      );
    }

    // rate limit por e-mail (contra spam de códigos e abuso do envio)
    const [[rate]] = await pool.query(
      `SELECT
         SUM(criado_em > NOW() - INTERVAL 60 SECOND) AS ultimo_min,
         SUM(criado_em > NOW() - INTERVAL 1 HOUR)   AS ultima_hora
       FROM auth_codigo WHERE email = ?`,
      [email]
    );
    if (Number(rate.ultimo_min) >= 1 || Number(rate.ultima_hora) >= 5) {
      return Response.json(
        { ok: false, erro: "Muitas solicitações — aguarde um instante e tente de novo." },
        { status: 429 }
      );
    }

    // só colaborador ATIVO da base recebe código; e-mail desconhecido recebe
    // a MESMA resposta 200 (não revela quais e-mails existem)
    const [[colab]] = await pool.query(
      "SELECT nome FROM colaborador WHERE email = ? AND ativo = 1 LIMIT 1",
      [email]
    );
    if (!colab) return Response.json(RESPOSTA_GENERICA);

    // um código válido por vez: os anteriores em aberto são consumidos
    await pool.query(
      "UPDATE auth_codigo SET usado_em = NOW() WHERE email = ? AND usado_em IS NULL",
      [email]
    );

    const codigo = gerarCodigo();
    const id = randomUUID();
    await pool.query(
      `INSERT INTO auth_codigo (id, email, codigo_hash, expira_em)
       VALUES (?, ?, ?, NOW() + INTERVAL ${EXPIRA_MIN} MINUTE)`,
      [id, email, hashCodigo(codigo)]
    );

    // entrega via Pipedream (carteiro). Timeout curto: falha de envio não
    // pode deixar código órfão válido — apaga e devolve erro.
    const url = process.env.PIPEDREAM_AUTH_URL;
    const secret = process.env.INC_AUTH_SECRET;
    if (!url || !secret) {
      await pool.query("DELETE FROM auth_codigo WHERE id = ?", [id]);
      return Response.json(
        { ok: false, erro: "Envio de e-mail não configurado (PIPEDREAM_AUTH_URL / INC_AUTH_SECRET no .env)." },
        { status: 500 }
      );
    }
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-inc-secret": secret },
        body: JSON.stringify({ email, nome: colab.nome, codigo }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`Pipedream respondeu ${r.status}`);
    } catch (e) {
      await pool.query("DELETE FROM auth_codigo WHERE id = ?", [id]);
      console.error("auth/solicitar: falha no envio do e-mail:", e.message);
      return Response.json(
        { ok: false, erro: "Não foi possível enviar o e-mail agora — tente novamente." },
        { status: 500 }
      );
    }

    return Response.json(RESPOSTA_GENERICA);
  } catch (e) {
    const msg = e?.codigo === "SEM_CONFIG" ? e.message : "Falha ao processar a solicitação.";
    console.error("auth/solicitar:", e.message);
    return Response.json({ ok: false, erro: msg }, { status: 500 });
  }
}
