// Troca do líder de uma ÁREA inteira — usada pelo card do líder externo no
// organograma (LiderAreaModal). A antiga gestão de áreas (listar, renomear,
// mesclar) foi absorvida pelos Catálogos (/catalogos) e removida daqui.
//   POST { acao: "trocar_lider", areaId, deMatricula, paraMatricula }

import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

function erroResposta(e) {
  const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
  return Response.json({ ok: false, erro: msg }, { status: 500 });
}

export async function POST(req) {
  try {
    const body = await req.json();
    const pool = getPool();

    // todos os colaboradores ativos da área que respondem ao líder atual
    // passam a responder ao novo (numa tacada só)
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

    return Response.json({ ok: false, erro: "Ação desconhecida." }, { status: 400 });
  } catch (e) {
    return erroResposta(e);
  }
}
