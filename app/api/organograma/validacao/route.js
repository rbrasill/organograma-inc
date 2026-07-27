// Validação do organograma de uma área.
//   GET  ?area=<setorId> → { ok, validadoEm|null, atual } — status do botão
//   POST { areaId }      → grava a validação (GESTOR ou ADMIN)
//
// O status não é um flag: guarda-se o HASH da estrutura da área no momento
// da validação (pessoas ativas + cargo + nível efetivo + líder, ordenado) e
// compara-se com o hash ATUAL. Assim, QUALQUER mudança estrutural — entrada,
// saída ou desativação de gente, troca de líder, cargo, área ou nível
// (inclusive o nível padrão do cargo alterado no catálogo) — invalida a
// validação sozinha, sem depender de cada tela de edição avisar. Mudanças
// não estruturais (nome, e-mail, telefone, datas, situação, local, regional)
// não mexem no hash e não invalidam.

import { createHash } from "crypto";
import { getPool } from "@/lib/db";
import { exigirNivel, sessaoAtual } from "@/lib/permissoes";
import { NIVEL } from "@/lib/perfis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function erroResposta(e) {
  const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
  return Response.json({ ok: false, erro: msg }, { status: 500 });
}

// fotografia estrutural da área: quem está nela, com que cargo, nível
// efetivo (variação da pessoa ou padrão do cargo) e respondendo a quem
async function hashArea(pool, setorId) {
  const [rows] = await pool.query(
    `SELECT c.id, c.cargo_id, COALESCE(c.nivel_id, cg.nivel_id) AS nivel_efetivo, c.lider_id
       FROM colaborador c
       LEFT JOIN cargo cg ON cg.id = c.cargo_id
      WHERE c.ativo = 1 AND c.setor_id = ?
      ORDER BY c.id`,
    [setorId]
  );
  const base = rows
    .map((r) => `${r.id}|${r.cargo_id || ""}|${r.nivel_efetivo || ""}|${r.lider_id || ""}`)
    .join("\n");
  return createHash("sha256").update(base).digest("hex");
}

export async function GET(req) {
  try {
    const pool = getPool();
    const setorId = new URL(req.url).searchParams.get("area");
    if (!setorId) return Response.json({ ok: false, erro: "Área não informada." }, { status: 400 });

    const [[val]] = await pool.query(
      `SELECT hash_estrutura, DATE_FORMAT(validado_em, '%d/%m/%Y') AS validado_em
         FROM area_validacao WHERE setor_id = ?`,
      [setorId]
    );
    if (!val) return Response.json({ ok: true, validadoEm: null, atual: false });

    const atual = (await hashArea(pool, setorId)) === val.hash_estrutura;
    return Response.json({ ok: true, validadoEm: val.validado_em, atual });
  } catch (e) {
    return erroResposta(e);
  }
}

export async function POST(req) {
  // validar é um atesto formal da estrutura: GESTOR ou ADMIN
  const bloqueio = exigirNivel(NIVEL.GESTOR);
  if (bloqueio) return bloqueio;
  try {
    const pool = getPool();
    const body = await req.json().catch(() => ({}));
    const setorId = String(body.areaId || "").trim();
    if (!setorId) return Response.json({ ok: false, erro: "Área não informada." }, { status: 400 });

    const [[setor]] = await pool.query("SELECT id FROM setor WHERE id = ?", [setorId]);
    if (!setor) return Response.json({ ok: false, erro: "Área não encontrada." }, { status: 404 });

    // quem validou (auditoria — a tela mostra só a data)
    const claims = sessaoAtual()?.claims || null;
    const hash = await hashArea(pool, setorId);
    await pool.query(
      `INSERT INTO area_validacao (setor_id, hash_estrutura, validado_em, validado_por_id, validado_por_nome)
       VALUES (?, ?, NOW(), ?, ?)
       ON DUPLICATE KEY UPDATE hash_estrutura = VALUES(hash_estrutura),
                               validado_em = NOW(),
                               validado_por_id = VALUES(validado_por_id),
                               validado_por_nome = VALUES(validado_por_nome)`,
      [setorId, hash, claims?.colaboradorId || null, claims?.nome || null]
    );

    const [[val]] = await pool.query(
      "SELECT DATE_FORMAT(validado_em, '%d/%m/%Y') AS validado_em FROM area_validacao WHERE setor_id = ?",
      [setorId]
    );
    return Response.json({ ok: true, validadoEm: val.validado_em, atual: true });
  } catch (e) {
    return erroResposta(e);
  }
}
