// Login passwordless — passo 2: validar o código digitado.
//   POST { email, codigo } →
//     UPDATE condicional ATÔMICO marca o código como usado SOMENTE se:
//     hash confere + não usado + não expirado + menos de 5 erros.
//     1 linha afetada → login ok: cria a sessão (cookie httpOnly assinado).
//     0 linhas → conta a tentativa errada e responde 401 genérico
//     (sem dizer SE o código existe, expirou ou estourou tentativas).
// O UPDATE atômico é o que garante uso único mesmo com requisições
// simultâneas — não há janela entre "conferir" e "marcar usado".

import { getPool } from "@/lib/db";
import { hashCodigo, assinarSessao, cookieSessao } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req) {
  try {
    const pool = getPool();
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const codigo = typeof body.codigo === "string" ? body.codigo.trim() : "";

    if (!email || !/^\d{6}$/.test(codigo)) {
      return Response.json(
        { ok: false, erro: "Informe o e-mail e o código de 6 dígitos." },
        { status: 400 }
      );
    }

    const [r] = await pool.query(
      `UPDATE auth_codigo
          SET usado_em = NOW()
        WHERE email = ? AND codigo_hash = ?
          AND usado_em IS NULL AND expira_em > NOW() AND tentativas < 5`,
      [email, hashCodigo(codigo)]
    );

    if (r.affectedRows !== 1) {
      // código errado: conta a tentativa no código ainda em aberto (se houver)
      await pool.query(
        `UPDATE auth_codigo SET tentativas = tentativas + 1
          WHERE email = ? AND usado_em IS NULL AND expira_em > NOW()`,
        [email]
      );
      return Response.json(
        { ok: false, erro: "Código inválido ou expirado — confira o e-mail ou solicite um novo." },
        { status: 401 }
      );
    }

    // sessão: token assinado em cookie httpOnly (o navegador não lê o valor)
    const [[colab]] = await pool.query(
      "SELECT nome FROM colaborador WHERE email = ? AND ativo = 1 LIMIT 1",
      [email]
    );
    const token = assinarSessao({ email, nome: colab?.nome || "" });
    return Response.json(
      { ok: true, nome: colab?.nome || "" },
      { headers: { "Set-Cookie": cookieSessao(token) } }
    );
  } catch (e) {
    const msg = e?.codigo === "SEM_CONFIG" ? e.message : "Falha ao validar o código.";
    console.error("auth/validar:", e.message);
    return Response.json({ ok: false, erro: msg }, { status: 500 });
  }
}
