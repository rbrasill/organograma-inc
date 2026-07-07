// Busca de colaboradores em TODO o banco (para o seletor de líder do modal,
// que precisa enxergar pessoas de qualquer área, não só da área atual).
//   GET ?q=<termo>[&excluir=<matricula>]  → busca por nome/cargo (limite 25)
//   GET ?matricula=<mat>                  → resolve 1 pessoa (nome/cargo/área)
// Retorna sempre { matricula, nome, cargo, setor }.

import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

function erroResposta(e) {
  const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
  return Response.json({ ok: false, erro: msg }, { status: 500 });
}

export async function GET(req) {
  try {
    const pool = getPool();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const excluir = url.searchParams.get("excluir") || "";
    const matricula = url.searchParams.get("matricula");

    const base =
      `SELECT c.codigo_dp AS matricula, c.nome, cg.nome AS cargo, st.nome AS setor
         FROM colaborador c
         LEFT JOIN cargo cg ON cg.id = c.cargo_id
         LEFT JOIN setor st ON st.id = c.setor_id
        WHERE c.ativo = 1 AND c.codigo_dp IS NOT NULL`;

    if (matricula) {
      const [rows] = await pool.query(`${base} AND c.codigo_dp = ? LIMIT 1`, [matricula]);
      return Response.json({ ok: true, pessoa: rows[0] || null });
    }

    // busca por nome ou cargo (acento/caixa-insensível pela collation)
    const like = `%${q}%`;
    const [rows] = await pool.query(
      `${base}
         AND c.codigo_dp <> ?
         AND (? = '' OR c.nome LIKE ? COLLATE utf8mb4_unicode_ci OR cg.nome LIKE ? COLLATE utf8mb4_unicode_ci)
        ORDER BY c.nome
        LIMIT 25`,
      [excluir, q, like, like]
    );
    return Response.json({ ok: true, resultados: rows });
  } catch (e) {
    return erroResposta(e);
  }
}
