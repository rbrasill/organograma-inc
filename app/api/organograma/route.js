// Leitura do organograma direto do banco (substitui o mock data/ti.js).
// GET /api/organograma[?area=<setorId>]
//   → { setores, areaId, pessoas, listas }
// Regras: só colaboradores ativos (soft delete) e com situação visível na
// árvore (situacao.ativo_na_arvore = 1); situação nula entra (com alerta no
// front). Líder é referenciado pela matrícula (codigo_dp) — quando o líder
// está fora da área, a pessoa vira raiz da árvore daquela área.

import { getPool } from "@/lib/db";
import { liderEDiretorDaArea } from "@/lib/diretorias";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const pool = getPool();
    const url = new URL(req.url);
    const areaParam = url.searchParams.get("area");
    const localParam = url.searchParams.get("local");

    const [setores] = await pool.query("SELECT id, nome FROM setor ORDER BY nome");
    if (setores.length === 0) {
      return Response.json({
        ok: true, setores: [], areaId: null, localId: null, pessoas: [],
        locais: [], totais: { geral: 0, sede: 0, campo: 0 },
        listas: { cargos: [], locais: [], areas: [], situacoes: [] },
        aviso: "Nenhuma área cadastrada — importe a base pelo Excel.",
      });
    }

    // listas dos dropdowns do modal (baratas — carregam sempre)
    const [cargos] = await pool.query("SELECT nome FROM cargo ORDER BY nome");
    const [locaisNome] = await pool.query("SELECT nome FROM local_trabalho ORDER BY nome");
    const [sits] = await pool.query("SELECT nome FROM situacao ORDER BY nome");
    const listas = {
      cargos: cargos.map((x) => x.nome),
      locais: locaisNome.map((x) => x.nome),
      areas: setores.map((s) => s.nome),
      situacoes: sits.map((x) => x.nome),
    };

    // filtro de LOCAL: só locais que têm gente ativa (evita opções vazias)
    const [locaisFiltro] = await pool.query(
      `SELECT l.id, l.nome FROM local_trabalho l
        WHERE EXISTS (SELECT 1 FROM colaborador c WHERE c.local_id = l.id AND c.ativo = 1)
        ORDER BY l.nome`
    );

    // TOTAIS globais (sempre): sede = local do Rossi (código 37); demais = resto
    const [[tot]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM colaborador WHERE ativo = 1) AS geral,
         (SELECT COUNT(*) FROM colaborador WHERE ativo = 1 AND tipo_contratacao = 'PJ') AS pj,
         (SELECT COUNT(*) FROM colaborador c
            JOIN local_trabalho l ON l.id = c.local_id
           WHERE c.ativo = 1 AND l.codigo_dp = '37') AS sede`
    );
    const totais = {
      geral: Number(tot.geral),
      sede: Number(tot.sede),
      campo: Number(tot.geral) - Number(tot.sede),
      pj: Number(tot.pj),
    };

    // ESCOPO do organograma: por ÁREA (setor) OU por LOCAL — um de cada vez
    // (área tem precedência se ambos vierem). Sem escopo NÃO carrega ninguém
    // (evita abrir a Obra, a mais pesada, por padrão).
    const areaId = areaParam && setores.some((s) => s.id === areaParam) ? areaParam : null;
    const localId = !areaId && localParam && locaisFiltro.some((l) => l.id === localParam) ? localParam : null;
    if (!areaId && !localId) {
      return Response.json({ ok: true, setores, areaId: null, localId: null, pessoas: [], locais: locaisFiltro, totais, listas });
    }
    // coluna de escopo (whitelist — nunca vem do usuário como texto livre)
    const escopoCol = areaId ? "setor_id" : "local_id";
    const escopoVal = areaId || localId;

    const [rows] = await pool.query(
      `SELECT c.id, c.codigo_dp, c.nome, c.email, c.tipo_contratacao,
              DATE_FORMAT(c.data_nascimento, '%Y-%m-%d') AS data_nascimento,
              DATE_FORMAT(c.data_admissao, '%Y-%m-%d') AS data_admissao,
              cg.nome AS cargo, lt.nome AS local, st.nome AS situacao,
              reg.nome AS regional,
              COALESCE(nhp.ordem, nh.ordem) AS nivel_ordem,
              COALESCE(nhp.familia, nh.familia) AS familia,
              COALESCE(nhp.cor, nh.cor) AS cor,
              ld.codigo_dp AS lider_codigo, ld.id AS lider_uuid, ld.nome AS lider_nome
         FROM colaborador c
         LEFT JOIN cargo cg            ON cg.id = c.cargo_id
         LEFT JOIN nivel_hierarquico nh ON nh.id = cg.nivel_id
         LEFT JOIN nivel_hierarquico nhp ON nhp.id = c.nivel_id
         LEFT JOIN local_trabalho lt   ON lt.id = c.local_id
         LEFT JOIN situacao st         ON st.id = c.situacao_id
         LEFT JOIN regional reg        ON reg.id = c.regional_id
         LEFT JOIN colaborador ld      ON ld.id = c.lider_id
        WHERE c.ativo = 1
          AND c.${escopoCol} = ?
          AND (c.situacao_id IS NULL OR st.ativo_na_arvore = 1)
        ORDER BY c.nome`,
      [escopoVal]
    );

    // líderes EXTERNOS: pessoas de outras áreas que lideram alguém desta área.
    // Entram no desenho como raiz (âncora) da árvore — ex.: um Diretor de
    // outro setor que lidera a área inteira. O campo `externo` marca o nó.
    const [extRows] = await pool.query(
      `SELECT DISTINCT c.id, c.codigo_dp, c.nome, c.email, c.tipo_contratacao,
              DATE_FORMAT(c.data_nascimento, '%Y-%m-%d') AS data_nascimento,
              DATE_FORMAT(c.data_admissao, '%Y-%m-%d') AS data_admissao,
              cg.nome AS cargo, lt.nome AS local, st.nome AS situacao,
              COALESCE(nhp.ordem, nh.ordem) AS nivel_ordem,
              COALESCE(nhp.familia, nh.familia) AS familia,
              COALESCE(nhp.cor, nh.cor) AS cor, se.nome AS setor_nome
         FROM colaborador c
         JOIN colaborador sub ON sub.lider_id = c.id AND sub.ativo = 1 AND sub.${escopoCol} = ?
         LEFT JOIN cargo cg             ON cg.id = c.cargo_id
         LEFT JOIN nivel_hierarquico nh ON nh.id = cg.nivel_id
         LEFT JOIN nivel_hierarquico nhp ON nhp.id = c.nivel_id
         LEFT JOIN local_trabalho lt    ON lt.id = c.local_id
         LEFT JOIN situacao st          ON st.id = c.situacao_id
         LEFT JOIN setor se             ON se.id = c.setor_id
        WHERE c.ativo = 1 AND (c.${escopoCol} IS NULL OR c.${escopoCol} <> ?)
        ORDER BY c.nome`,
      [escopoVal, escopoVal]
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
      regional: r.regional || "",
      nascimento: r.data_nascimento || "",
      admissao: r.data_admissao || "",
      nivelOrdem: r.nivel_ordem || null,
      familia: r.familia || "",
      cor: r.cor || null,
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
      regional: r.regional || "",
      nascimento: r.data_nascimento || "",
      admissao: r.data_admissao || "",
      nivelOrdem: r.nivel_ordem || null,
      familia: r.familia || "",
      cor: r.cor || null,
    }));

    let pessoas = [...externos, ...membros];

    // ===== DIRETOR RESPONSÁVEL no desenho (só no escopo por área) =====
    // Regra do domínio: toda área tem um líder direto e, acima dele, um
    // diretor (ou a presidência). O diretor entra no TOPO do desenho e as
    // raízes da área penduram nele — mesmo cálculo da tela Diretorias.
    let liderAreaNome = "";
    let diretorNome = "";
    if (areaId) {
      const { lider, diretor } = await liderEDiretorDaArea(pool, areaId);
      liderAreaNome = lider?.nome || "";
      diretorNome = diretor?.nome || "";
      if (diretor) {
        const dirId = diretor.matricula || diretor.id;
        let dirNode = pessoas.find((p) => p.id === dirId);
        if (dirNode) {
          // o diretor já é um card da área (âncora externa ou o próprio líder)
          dirNode.diretor = true;
        } else {
          dirNode = {
            id: dirId,
            nome: diretor.nome,
            cargo: diretor.cargo || "",
            local: "",
            situacao: "",
            email: "",
            lider: null,
            liderNome: "",
            pj: String(dirId).toUpperCase().startsWith("PJ"),
            regional: "",
            nascimento: "",
            admissao: "",
            nivelOrdem: diretor.ordem || null,
            familia: diretor.familia || "",
            cor: diretor.cor || null,
            diretor: true,
            pseudo: true, // não é membro da área — só o card do responsável
            setorOrigem: diretor.setorNome || "",
          };
          pessoas.unshift(dirNode);
        }
        // O desenho da área PARA no diretor: a cadeia acima dele (ex.: a
        // presidência, quando o diretor é membro da área) sai do desenho —
        // senão o chefe do diretor viraria filho dele e a árvore entraria em
        // ciclo (raiz nenhuma → área "vazia").
        const liderDoDiretor = dirNode.lider || null;
        dirNode.lider = null;
        if (liderDoDiretor) {
          pessoas = pessoas.filter((p) => !(p.externo && p.id === liderDoDiretor));
        }
        // TODAS as raízes do desenho penduram no diretor (âncoras externas e
        // topos soltos); quem respondia a alguém de fora que não é o diretor
        // guarda a informação para o aviso do card. O próprio diretor fica de
        // fora do laço — a raiz do desenho é ele.
        const ids = new Set(pessoas.map((p) => p.id));
        for (const p of pessoas) {
          if (p.id === dirId) continue;
          const raiz = !p.lider || !ids.has(p.lider);
          if (!raiz) continue;
          if (p.lider && p.liderNome && p.liderNome !== diretor.nome) {
            p.respondeForaNome = p.liderNome;
          }
          p.lider = dirId;
        }
      }
    }

    return Response.json({ ok: true, setores, areaId, localId, pessoas, locais: locaisFiltro, totais, listas, liderAreaNome, diretorNome });
  } catch (e) {
    const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
    return Response.json({ ok: false, erro: msg }, { status: 500 });
  }
}
