// Líderes por área — visão agrupada por DIRETOR.
//   Regras do domínio (CLAUDE.md): o LÍDER de uma área é o colaborador que,
//   dentro dela, não responde a ninguém da própria área (topo do subtree
//   local). O DIRETOR é a quem esse líder responde — tipicamente alguém de
//   outra área que gerencia várias áreas (ex.: Rodrigo Faria → DP com
//   Rodrigo Agreli, Controladoria com Rubens).
//
//   GET → { diretores: [ { diretor, areas: [...] } ], semDiretor: [areas] }
//   POST { acao:"trocar", areaId, deMatricula, paraMatricula }
//     → troca o líder da área INTEIRA, numa transação:
//       1. novo líder (se for da área) herda o diretor do antigo;
//       2. todos da área que respondiam ao antigo passam ao novo;
//       3. o antigo (membro da área) passa a responder ao novo.

import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

function erroResposta(e) {
  const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
  return Response.json({ ok: false, erro: msg }, { status: 500 });
}

export async function GET() {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT c.id, c.codigo_dp AS matricula, c.nome, c.setor_id AS setorId,
              c.lider_id AS liderId, cg.nome AS cargo,
              COALESCE(nhp.ordem, nh.ordem) AS ordem,
              s.nome AS setorNome
         FROM colaborador c
         LEFT JOIN cargo cg              ON cg.id = c.cargo_id
         LEFT JOIN nivel_hierarquico nh  ON nh.id = cg.nivel_id
         LEFT JOIN nivel_hierarquico nhp ON nhp.id = c.nivel_id
         LEFT JOIN setor s               ON s.id = c.setor_id
        WHERE c.ativo = 1`
    );

    const byId = new Map(rows.map((r) => [r.id, r]));
    const diretos = new Map(); // id -> nº de subordinados diretos ativos
    rows.forEach((r) => {
      if (r.liderId) diretos.set(r.liderId, (diretos.get(r.liderId) || 0) + 1);
    });

    // agrupa por setor e acha as raízes locais de cada área
    const porSetor = new Map();
    rows.forEach((r) => {
      if (!r.setorId) return;
      if (!porSetor.has(r.setorId)) porSetor.set(r.setorId, []);
      porSetor.get(r.setorId).push(r);
    });

    const ord = (r) => (r.ordem == null ? 99 : r.ordem);
    const grupos = new Map(); // chave: diretor.id ou "sem"

    for (const [setorId, membros] of porSetor) {
      const raizes = membros.filter((m) => {
        if (!m.liderId) return true;
        const l = byId.get(m.liderId);
        return !l || l.setorId !== setorId; // líder de fora (ou inativo) = raiz local
      });
      if (raizes.length === 0) continue; // ciclo interno — some da lista até corrigir

      raizes.sort((a, b) =>
        ord(a) - ord(b) || (diretos.get(b.id) || 0) - (diretos.get(a.id) || 0) ||
        a.nome.localeCompare(b.nome, "pt-BR")
      );
      const lider = raizes[0];
      const diretor = lider.liderId ? byId.get(lider.liderId) || null : null;

      const area = {
        id: setorId,
        nome: membros[0].setorNome || "—",
        pessoas: membros.length,
        outrosTopo: raizes.length - 1,
        lider: {
          matricula: lider.matricula || "",
          nome: lider.nome,
          cargo: lider.cargo || "",
          diretos: diretos.get(lider.id) || 0,
        },
      };

      const chave = diretor ? diretor.id : "sem";
      if (!grupos.has(chave)) {
        grupos.set(chave, {
          diretor: diretor ? {
            matricula: diretor.matricula || "",
            nome: diretor.nome,
            cargo: diretor.cargo || "",
            setor: diretor.setorNome || "",
          } : null,
          areas: [],
        });
      }
      grupos.get(chave).areas.push(area);
    }

    const todos = [...grupos.values()];
    todos.forEach((g) => g.areas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    const diretores = todos.filter((g) => g.diretor)
      .sort((a, b) => b.areas.length - a.areas.length || a.diretor.nome.localeCompare(b.diretor.nome, "pt-BR"));
    const semDiretor = todos.find((g) => !g.diretor)?.areas || [];

    return Response.json({ ok: true, diretores, semDiretor });
  } catch (e) {
    return erroResposta(e);
  }
}

export async function POST(req) {
  let conn;
  try {
    const pool = getPool();
    const body = await req.json();
    if (body.acao !== "trocar") return Response.json({ ok: false, erro: "Ação desconhecida." }, { status: 400 });

    const { areaId, deMatricula, paraMatricula } = body;
    if (!areaId || !deMatricula || !paraMatricula) {
      return Response.json({ ok: false, erro: "Dados incompletos." }, { status: 400 });
    }
    if (deMatricula === paraMatricula) {
      return Response.json({ ok: false, erro: "Escolha uma pessoa diferente do líder atual." }, { status: 400 });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [[antigo]] = await conn.query(
      "SELECT id, nome, setor_id, lider_id FROM colaborador WHERE codigo_dp = ? FOR UPDATE", [deMatricula]
    );
    const [[novo]] = await conn.query(
      "SELECT id, nome, setor_id FROM colaborador WHERE codigo_dp = ? AND ativo = 1 FOR UPDATE", [paraMatricula]
    );
    if (!antigo) { await conn.rollback(); return Response.json({ ok: false, erro: "Líder atual não encontrado." }, { status: 404 }); }
    if (!novo) { await conn.rollback(); return Response.json({ ok: false, erro: "Novo líder não encontrado (ou inativo)." }, { status: 404 }); }

    // 1. novo líder da própria área herda o diretor do antigo (quem é de fora
    //    mantém o próprio líder — vira âncora externa, como um diretor)
    if (novo.setor_id === areaId) {
      await conn.query("UPDATE colaborador SET lider_id = ? WHERE id = ?", [antigo.lider_id || null, novo.id]);
    }
    // 2. todos da área que respondiam ao antigo passam ao novo
    const [r] = await conn.query(
      "UPDATE colaborador SET lider_id = ? WHERE setor_id = ? AND ativo = 1 AND lider_id = ? AND id <> ?",
      [novo.id, areaId, antigo.id, novo.id]
    );
    // 3. o antigo (se for membro da área) passa a responder ao novo
    let antigoReaponta = false;
    if (antigo.setor_id === areaId) {
      await conn.query("UPDATE colaborador SET lider_id = ? WHERE id = ?", [novo.id, antigo.id]);
      antigoReaponta = true;
    }

    await conn.commit();
    return Response.json({
      ok: true,
      reapontados: r.affectedRows || 0,
      antigoReaponta,
      liderExterno: novo.setor_id !== areaId,
    });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch {} }
    return erroResposta(e);
  } finally {
    if (conn) conn.release();
  }
}
