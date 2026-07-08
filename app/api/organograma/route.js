// Leitura do organograma direto do banco (substitui o mock data/ti.js).
// GET /api/organograma[?area=<setorId>]
//   → { setores, areaId, pessoas, listas }
// Regras: só colaboradores ativos (soft delete) e com situação visível na
// árvore (situacao.ativo_na_arvore = 1); situação nula entra (com alerta no
// front). Líder é referenciado pela matrícula (codigo_dp) — quando o líder
// está fora da área, a pessoa vira raiz da árvore daquela área.

import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const pool = getPool();
    const url = new URL(req.url);
    const areaParam = url.searchParams.get("area");

    const [setores] = await pool.query("SELECT id, nome FROM setor ORDER BY nome");
    if (setores.length === 0) {
      return Response.json({
        ok: true, setores: [], areaId: null, pessoas: [],
        listas: { cargos: [], locais: [], areas: [], situacoes: [] },
        aviso: "Nenhuma área cadastrada — importe a base pelo Excel.",
      });
    }

    // listas dos dropdowns do modal (baratas — carregam sempre)
    const [cargos] = await pool.query("SELECT nome FROM cargo ORDER BY nome");
    const [locais] = await pool.query("SELECT nome FROM local_trabalho ORDER BY nome");
    const [sits] = await pool.query("SELECT nome FROM situacao ORDER BY nome");
    const listas = {
      cargos: cargos.map((x) => x.nome),
      locais: locais.map((x) => x.nome),
      areas: setores.map((s) => s.nome),
      situacoes: sits.map((x) => x.nome),
    };

    // Sem área selecionada NÃO carrega ninguém (evita abrir a Obra, a mais
    // pesada, por padrão). O usuário escolhe a área no seletor ou busca a
    // pessoa — que abre direto a área dela.
    const areaId = areaParam && setores.some((s) => s.id === areaParam) ? areaParam : null;
    if (!areaId) {
      return Response.json({ ok: true, setores, areaId: null, pessoas: [], listas });
    }

    const [rows] = await pool.query(
      `SELECT c.id, c.codigo_dp, c.nome, c.email, c.tipo_contratacao,
              cg.nome AS cargo, lt.nome AS local, st.nome AS situacao,
              COALESCE(nhp.ordem, nh.ordem) AS nivel_ordem,
              COALESCE(nhp.familia, nh.familia) AS familia,
              ld.codigo_dp AS lider_codigo, ld.id AS lider_uuid, ld.nome AS lider_nome
         FROM colaborador c
         LEFT JOIN cargo cg            ON cg.id = c.cargo_id
         LEFT JOIN nivel_hierarquico nh ON nh.id = cg.nivel_id
         LEFT JOIN nivel_hierarquico nhp ON nhp.id = c.nivel_id
         LEFT JOIN local_trabalho lt   ON lt.id = c.local_id
         LEFT JOIN situacao st         ON st.id = c.situacao_id
         LEFT JOIN colaborador ld      ON ld.id = c.lider_id
        WHERE c.ativo = 1
          AND c.setor_id = ?
          AND (c.situacao_id IS NULL OR st.ativo_na_arvore = 1)
        ORDER BY c.nome`,
      [areaId]
    );

    // líderes EXTERNOS: pessoas de outras áreas que lideram alguém desta área.
    // Entram no desenho como raiz (âncora) da árvore — ex.: um Diretor de
    // outro setor que lidera a área inteira. O campo `externo` marca o nó.
    const [extRows] = await pool.query(
      `SELECT DISTINCT c.id, c.codigo_dp, c.nome, c.email, c.tipo_contratacao,
              cg.nome AS cargo, lt.nome AS local, st.nome AS situacao,
              COALESCE(nhp.ordem, nh.ordem) AS nivel_ordem,
              COALESCE(nhp.familia, nh.familia) AS familia, se.nome AS setor_nome
         FROM colaborador c
         JOIN colaborador sub ON sub.lider_id = c.id AND sub.ativo = 1 AND sub.setor_id = ?
         LEFT JOIN cargo cg             ON cg.id = c.cargo_id
         LEFT JOIN nivel_hierarquico nh ON nh.id = cg.nivel_id
         LEFT JOIN nivel_hierarquico nhp ON nhp.id = c.nivel_id
         LEFT JOIN local_trabalho lt    ON lt.id = c.local_id
         LEFT JOIN situacao st          ON st.id = c.situacao_id
         LEFT JOIN setor se             ON se.id = c.setor_id
        WHERE c.ativo = 1 AND (c.setor_id IS NULL OR c.setor_id <> ?)
        ORDER BY c.nome`,
      [areaId, areaId]
    );

    const externos = extRows.map((r) => ({
      id: r.codigo_dp || r.id,
      nome: r.nome,
      cargo: r.cargo || "",
      local: r.local || "",
      situacao: r.situacao || "",
      email: r.email || "",
      lider: null, // âncora da área: a cadeia acima dele não é desenhada aqui
      liderNome: "",
      pj: r.tipo_contratacao === "PJ",
      nivelOrdem: r.nivel_ordem || null,
      familia: r.familia || "",
      externo: true,
      setorOrigem: r.setor_nome || "",
    }));

    const membros = rows.map((r) => ({
      id: r.codigo_dp || r.id,
      nome: r.nome,
      cargo: r.cargo || "",
      local: r.local || "",
      situacao: r.situacao || "",
      email: r.email || "",
      lider: r.lider_codigo || r.lider_uuid || null,
      liderNome: r.lider_nome || "",
      pj: r.tipo_contratacao === "PJ",
      nivelOrdem: r.nivel_ordem || null,
      familia: r.familia || "",
    }));

    const pessoas = [...externos, ...membros];

    return Response.json({ ok: true, setores, areaId, pessoas, listas });
  } catch (e) {
    const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
    return Response.json({ ok: false, erro: msg }, { status: 500 });
  }
}
