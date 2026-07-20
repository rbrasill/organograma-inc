// Login por CPF + data de nascimento (POST { cpf, nascimento }).
// A credencial é fraca (CPF e nascimento não são segredos), então esta rota
// compensa com:
//  * resposta SEMPRE genérica em falha (nunca diz qual campo errou nem se o
//    CPF existe na base — anti-enumeração);
//  * rate limit pela tabela auth_login_tentativa (mig. 08):
//      >= 5 falhas do MESMO CPF em 15 min  → 429
//      >= 30 tentativas do MESMO IP em 1 h → 429
//  * só colaborador ATIVO entra; CPF duplicado (recontratação com nova chapa)
//    desempata pelo vínculo de admissão mais recente;
//  * o CPF NUNCA entra no token de sessão (payload é base64 legível).
// Perfil: lido de usuario_perfil (RH/DIRETORIA/LIDER); default COLABORADOR —
// a fase 2 dos níveis de acesso usa este claim.

import { randomUUID } from "crypto";
import { getPool } from "@/lib/db";
import { assinarSessao, cookieSessao } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ERRO_GENERICO = "CPF ou data de nascimento não conferem.";
const MAX_FALHAS_CPF_15MIN = 5;
const MAX_TENTATIVAS_IP_1H = 30;

function erroResposta(e) {
  const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
  return Response.json({ ok: false, erro: msg }, { status: 500 });
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const cpf = String(body.cpf || "").replace(/\D/g, "");
    const nascimento = String(body.nascimento || "").trim();

    if (cpf.length !== 11 || !/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) {
      return Response.json({ ok: false, erro: ERRO_GENERICO }, { status: 401 });
    }

    const pool = getPool();
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

    // ---- rate limit (janelas na auth_login_tentativa) ----
    const [[lim]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM auth_login_tentativa
           WHERE cpf = ? AND sucesso = 0 AND criado_em > NOW() - INTERVAL 15 MINUTE) AS falhas_cpf,
         (SELECT COUNT(*) FROM auth_login_tentativa
           WHERE ip = ? AND criado_em > NOW() - INTERVAL 1 HOUR) AS tentativas_ip`,
      [cpf, ip]
    );
    if (Number(lim.falhas_cpf) >= MAX_FALHAS_CPF_15MIN || Number(lim.tentativas_ip) >= MAX_TENTATIVAS_IP_1H) {
      return Response.json(
        { ok: false, erro: "Muitas tentativas. Aguarde alguns minutos e tente de novo." },
        { status: 429 }
      );
    }

    // ---- credencial: colaborador ativo com CPF + nascimento exatos.
    // CPF duplicado (recontratação): vale o vínculo de admissão mais recente.
    const [rows] = await pool.query(
      `SELECT c.id, c.codigo_dp, c.nome
         FROM colaborador c
        WHERE c.cpf = ? AND c.data_nascimento = ? AND c.ativo = 1
        ORDER BY c.data_admissao DESC, c.criado_em DESC
        LIMIT 1`,
      [cpf, nascimento]
    );
    const colab = rows[0] || null;

    // registra a tentativa (falha ou sucesso) + limpeza oportunista (>1 dia)
    await pool.query(
      "INSERT INTO auth_login_tentativa (id, cpf, ip, sucesso) VALUES (?, ?, ?, ?)",
      [randomUUID(), cpf, ip, colab ? 1 : 0]
    );
    await pool.query("DELETE FROM auth_login_tentativa WHERE criado_em < NOW() - INTERVAL 1 DAY");

    if (!colab) {
      return Response.json({ ok: false, erro: ERRO_GENERICO }, { status: 401 });
    }

    // perfil: um por colaborador em usuario_perfil; sem linha = PADRÃO (só
    // visualização). Rede de segurança anti-lock-out: CPFs listados na env
    // ACESSO_ADMIN_CPFS entram como ADMIN mesmo sem linha na tabela.
    const [[linhaPerfil]] = await pool.query(
      "SELECT perfil FROM usuario_perfil WHERE colaborador_id = ? LIMIT 1",
      [colab.id]
    );
    const adminsEnv = (process.env.ACESSO_ADMIN_CPFS || "")
      .split(",").map((s) => s.replace(/\D/g, "")).filter(Boolean);
    const perfil = adminsEnv.includes(cpf) ? "ADMIN" : (linhaPerfil?.perfil || "PADRAO");

    const token = assinarSessao({
      colaboradorId: colab.id,
      matricula: colab.codigo_dp,
      nome: colab.nome,
      perfil,
    });
    return new Response(JSON.stringify({ ok: true, nome: colab.nome }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Set-Cookie": cookieSessao(token) },
    });
  } catch (e) {
    return erroResposta(e);
  }
}
