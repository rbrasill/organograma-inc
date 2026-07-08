// Gestão de áreas (setor) — para o RH administrar sem tocar no banco.
//   GET  → lista de áreas com contagem de pessoas ativas
//   POST { acao: "renomear", id, nome }              → corrige o nome oficial
//   POST { acao: "mesclar",  origemId, destinoId }   → junta duplicata: move
//         os colaboradores para a área destino, ajusta histórico e remove a
//         área origem (conserta typos que já entraram no banco)

import { getPool } from "@/lib/db";
import { normalizar } from "@/data/ti";

export const dynamic = "force-dynamic";

function erroResposta(e) {
  const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
  return Response.json({ ok: false, erro: msg }, { status: 500 });
}

export async function GET() {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT s.id, s.nome,
              COUNT(c.id) AS pessoas
         FROM setor s
         LEFT JOIN colaborador c ON c.setor_id = s.id AND c.ativo = 1
        GROUP BY s.id, s.nome
        ORDER BY pessoas DESC, s.nome`
    );
    return Response.json({ ok: true, areas: rows.map((r) => ({ id: r.id, nome: r.nome, pessoas: Number(r.pessoas) })) });
  } catch (e) {
    return erroResposta(e);
  }
}

export async function POST(req) {
  let conn;
  try {
    const body = await req.json();
    const pool = getPool();

    if (body.acao === "renomear") {
      const nome = (body.nome || "").trim();
      if (!nome) return Response.json({ ok: false, erro: "Informe o novo nome." }, { status: 400 });
      const norm = normalizar(nome);
      const [dup] = await pool.query(
        "SELECT id, nome FROM setor WHERE nome_normalizado = ? AND id <> ?", [norm, body.id]
      );
      if (dup.length) {
        return Response.json({
          ok: false,
          erro: `Já existe a área "${dup[0].nome}". Para unir as duas, use "Mesclar" em vez de renomear.`,
        }, { status: 409 });
      }
      await pool.query("UPDATE setor SET nome = ?, nome_normalizado = ? WHERE id = ?", [nome, norm, body.id]);
      return Response.json({ ok: true });
    }

    // troca o líder da ÁREA: todos os colaboradores ativos da área que
    // respondem ao líder atual passam a responder ao novo (numa tacada só).
    // Usado pelo card do líder externo no organograma.
    if (body.acao === "trocar_lider") {
      const { areaId, deMatricula, paraMatricula } = body;
      if (!areaId || !deMatricula || !paraMatricula) {
        return Response.json({ ok: false, erro: "Dados incompletos." }, { status: 400 });
      }
      if (deMatricula === paraMatricula) {
        return Response.json({ ok: false, erro: "Escolha uma pessoa diferente do líder atual." }, { status: 400 });
      }
      const [[de]] = await pool.query("SELECT id FROM colaborador WHERE codigo_dp = ?", [deMatricula]);
      const [[para]] = await pool.query("SELECT id FROM colaborador WHERE codigo_dp = ? AND ativo = 1", [paraMatricula]);
      if (!de) return Response.json({ ok: false, erro: "Líder atual não encontrado no banco." }, { status: 404 });
      if (!para) return Response.json({ ok: false, erro: "Novo líder não encontrado (ou inativo)." }, { status: 404 });
      // id <> para.id: se o novo líder for da própria área e respondia ao
      // antigo, ele não pode passar a responder a si mesmo
      const [r] = await pool.query(
        "UPDATE colaborador SET lider_id = ? WHERE setor_id = ? AND ativo = 1 AND lider_id = ? AND id <> ?",
        [para.id, areaId, de.id, para.id]
      );
      return Response.json({ ok: true, alterados: r.affectedRows || 0 });
    }

    if (body.acao === "mesclar") {
      const { origemId, destinoId } = body;
      if (!origemId || !destinoId || origemId === destinoId) {
        return Response.json({ ok: false, erro: "Selecione duas áreas diferentes." }, { status: 400 });
      }
      conn = await pool.getConnection();
      await conn.beginTransaction();
      // move colaboradores e histórico da origem para o destino, ajusta
      // eventuais sub-áreas, e remove a área origem
      const [mv] = await conn.query("UPDATE colaborador SET setor_id = ? WHERE setor_id = ?", [destinoId, origemId]);
      await conn.query("UPDATE colaborador_historico SET setor_id = ? WHERE setor_id = ?", [destinoId, origemId]);
      await conn.query("UPDATE setor SET setor_pai_id = ? WHERE setor_pai_id = ?", [destinoId, origemId]);
      await conn.query("DELETE FROM setor WHERE id = ?", [origemId]);
      await conn.commit();
      return Response.json({ ok: true, movidos: mv.affectedRows || 0 });
    }

    return Response.json({ ok: false, erro: "Ação desconhecida." }, { status: 400 });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch {} }
    return erroResposta(e);
  } finally {
    if (conn) conn.release();
  }
}
