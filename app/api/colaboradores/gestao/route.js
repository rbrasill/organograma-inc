// Edição administrativa de colaboradores (tela "Editar colaboradores").
// Aplica as alterações DIRETO no banco, sem passar pelo fluxo de solicitação
// e SEM manter histórico (decisão do produto para esta tela).
//   GET (sem params) → { areas, listas } para montar filtros e selects
//   GET ?setor=<id>&q=<termo> → { colaboradores } (lista para localizar)
//   GET ?id=<uuid>            → { colaborador } com todos os campos e ids
//   POST { id, campos }       → atualiza o colaborador e devolve o registro novo

import { getPool } from "@/lib/db";
import { normalizar } from "@/data/ti";

export const dynamic = "force-dynamic";

function erroResposta(e) {
  const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
  return Response.json({ ok: false, erro: msg }, { status: 500 });
}

// registro completo do colaborador (campos + ids das FKs + nomes resolvidos)
async function carregarColaborador(pool, id) {
  const [rows] = await pool.query(
    `SELECT c.id, c.codigo_dp, c.nome, c.email, c.tipo_contratacao, c.ativo,
            c.cargo_id, c.setor_id, c.local_id, c.regional_id, c.situacao_id, c.lider_id,
            cg.nome AS cargo, s.nome AS setor, lt.nome AS local,
            reg.nome AS regional, sit.nome AS situacao,
            ld.codigo_dp AS lider_mat, ld.nome AS lider_nome
       FROM colaborador c
       LEFT JOIN cargo cg          ON cg.id = c.cargo_id
       LEFT JOIN setor s           ON s.id = c.setor_id
       LEFT JOIN local_trabalho lt ON lt.id = c.local_id
       LEFT JOIN regional reg      ON reg.id = c.regional_id
       LEFT JOIN situacao sit      ON sit.id = c.situacao_id
       LEFT JOIN colaborador ld    ON ld.id = c.lider_id
      WHERE c.id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function GET(req) {
  try {
    const pool = getPool();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const setor = url.searchParams.get("setor");
    const q = (url.searchParams.get("q") || "").trim();

    // detalhe de um colaborador
    if (id) {
      const c = await carregarColaborador(pool, id);
      if (!c) return Response.json({ ok: false, erro: "Colaborador não encontrado." }, { status: 404 });
      return Response.json({ ok: true, colaborador: c });
    }

    // busca (área e/ou nome). Sem filtro nenhum não lista tudo (base grande):
    // exige área OU um termo de busca.
    if (setor || q) {
      const cond = ["c.ativo = 1"];
      const args = [];
      if (setor) { cond.push("c.setor_id = ?"); args.push(setor); }
      if (q) {
        cond.push("c.nome LIKE ? COLLATE utf8mb4_unicode_ci");
        args.push(`%${q}%`);
      }
      const [rows] = await pool.query(
        `SELECT c.id, c.codigo_dp AS matricula, c.nome, cg.nome AS cargo, s.nome AS setor
           FROM colaborador c
           LEFT JOIN cargo cg ON cg.id = c.cargo_id
           LEFT JOIN setor s  ON s.id = c.setor_id
          WHERE ${cond.join(" AND ")}
          ORDER BY c.nome
          LIMIT 200`,
        args
      );
      return Response.json({ ok: true, colaboradores: rows });
    }

    // bootstrap: áreas (com contagem) + listas para os selects
    const [areas] = await pool.query(
      `SELECT s.id, s.nome, COUNT(c.id) AS pessoas
         FROM setor s
         LEFT JOIN colaborador c ON c.setor_id = s.id AND c.ativo = 1
        GROUP BY s.id, s.nome
        ORDER BY s.nome`
    );
    const [cargos]     = await pool.query("SELECT id, nome FROM cargo ORDER BY nome");
    const [setores]    = await pool.query("SELECT id, nome FROM setor ORDER BY nome");
    const [locais]     = await pool.query("SELECT id, nome FROM local_trabalho ORDER BY nome");
    const [regionais]  = await pool.query("SELECT id, nome FROM regional ORDER BY nome");
    const [situacoes]  = await pool.query("SELECT id, nome FROM situacao ORDER BY nome");

    return Response.json({
      ok: true,
      areas: areas.map((a) => ({ id: a.id, nome: a.nome, pessoas: Number(a.pessoas) })),
      listas: { cargos, setores, locais, regionais, situacoes },
    });
  } catch (e) {
    return erroResposta(e);
  }
}

export async function POST(req) {
  try {
    const pool = getPool();
    const body = await req.json();
    const { id, campos } = body;
    if (!id || !campos) return Response.json({ ok: false, erro: "Dados incompletos." }, { status: 400 });

    const [[alvo]] = await pool.query("SELECT id FROM colaborador WHERE id = ?", [id]);
    if (!alvo) return Response.json({ ok: false, erro: "Colaborador não encontrado." }, { status: 404 });

    const nome = (campos.nome || "").trim();
    if (!nome) return Response.json({ ok: false, erro: "O nome não pode ficar em branco." }, { status: 400 });

    const tipo = normalizar(campos.tipo || "").includes("pj") ? "PJ" : "CLT";

    // resolve o líder pela matrícula (pode ser de qualquer área). Impede
    // auto-liderança (colaborador não pode ser o próprio líder).
    let liderId = null;
    if (campos.liderMatricula) {
      const [[l]] = await pool.query("SELECT id FROM colaborador WHERE codigo_dp = ?", [campos.liderMatricula]);
      if (!l) return Response.json({ ok: false, erro: `Líder de matrícula "${campos.liderMatricula}" não encontrado.` }, { status: 400 });
      if (l.id === id) return Response.json({ ok: false, erro: "O colaborador não pode ser o próprio líder." }, { status: 400 });
      liderId = l.id;
    }

    // FKs por id (os selects já mandam o id; string vazia = NULL)
    const fk = (v) => (v ? v : null);

    await pool.query(
      `UPDATE colaborador
          SET nome = ?, email = ?, tipo_contratacao = ?,
              cargo_id = ?, setor_id = ?, local_id = ?, regional_id = ?, situacao_id = ?,
              lider_id = ?
        WHERE id = ?`,
      [
        nome, (campos.email || "").trim() || null, tipo,
        fk(campos.cargoId), fk(campos.setorId), fk(campos.localId),
        fk(campos.regionalId), fk(campos.situacaoId), liderId, id,
      ]
    );

    const atualizado = await carregarColaborador(pool, id);
    return Response.json({ ok: true, colaborador: atualizado });
  } catch (e) {
    return erroResposta(e);
  }
}
