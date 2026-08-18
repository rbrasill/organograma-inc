// Diretorias (ex-Líderes por área) — visão agrupada por DIRETOR.
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
import { liderEDiretorDaArea } from "@/lib/diretorias";
import { exigirNivel } from "@/lib/permissoes";
import { NIVEL } from "@/lib/perfis";

export const dynamic = "force-dynamic";

function erroResposta(e) {
  const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
  return Response.json({ ok: false, erro: msg }, { status: 500 });
}

export async function GET(req) {
  // ver Diretorias: perfil COLABORADOR para cima (somente leitura)
  const bloqueio = exigirNivel(NIVEL.COLABORADOR);
  if (bloqueio) return bloqueio;
  try {
    const pool = getPool();
    const perfilMat = new URL(req.url).searchParams.get("perfil");
    const [rows] = await pool.query(
      `SELECT c.id, c.codigo_dp AS matricula, c.nome, c.setor_id AS setorId,
              c.lider_id AS liderId, cg.nome AS cargo,
              COALESCE(nhp.ordem, nh.ordem) AS ordem,
              COALESCE(nhp.familia, nh.familia) AS familia,
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

    // Regra de negócio: toda área é ligada a um DIRETOR (níveis 2–5: CFO,
    // Diretor, Vice-Diretor); quando não há diretor na cadeia, é ligada ao
    // Presidente/Conselheiro (nível 1 — os únicos nesse nível).
    const ehDiretoria = (p) => p && p.ordem != null && p.ordem >= 2 && p.ordem <= 5;
    const ehPresidencia = (p) => p && p.ordem === 1;

    // sobe a cadeia A PARTIR DO PRÓPRIO líder da área: o primeiro com nível
    // de diretoria é o diretor responsável (se o líder já é diretor, é ele
    // mesmo); chegando ao nível 1 sem diretor, o grupo é a presidência.
    function responsavelDe(liderRow) {
      const vistos = new Set();
      let cur = liderRow;
      while (cur && !vistos.has(cur.id)) {
        vistos.add(cur.id);
        if (ehDiretoria(cur)) return { pessoa: cur, tipo: "diretor" };
        if (ehPresidencia(cur)) return { pessoa: cur, tipo: "presidencia" };
        cur = cur.liderId ? byId.get(cur.liderId) : null;
      }
      return { pessoa: null, tipo: "topo" };
    }

    const grupos = new Map(); // chave: pessoa responsável (diretor/presidência) ou "topo"

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

      // UMA raiz interna → ela é o líder da área (ex.: DP → Rodrigo Agreli).
      // VÁRIAS raízes → ninguém lidera internamente: o líder da área é a
      // pessoa EXTERNA a quem o topo responde.
      let lider, liderExterno = false, diretosNaArea;
      if (raizes.length === 1) {
        lider = raizes[0];
        diretosNaArea = diretos.get(lider.id) || 0;
      } else {
        const cont = new Map();
        raizes.forEach((r) => { if (r.liderId) cont.set(r.liderId, (cont.get(r.liderId) || 0) + 1); });
        let extId = null, max = 0;
        for (const [eid, n] of cont) if (n > max) { max = n; extId = eid; }
        const ext = extId ? byId.get(extId) : null;
        if (ext) {
          lider = ext;
          liderExterno = true;
          diretosNaArea = max; // diretos DENTRO da área (não os globais dele)
        } else {
          lider = raizes[0]; // todas as raízes sem líder algum (topo absoluto)
          diretosNaArea = diretos.get(lider.id) || 0;
        }
      }

      // diretor responsável: sobe a cadeia a partir do líder (inclui ele próprio)
      const resp = responsavelDe(lider);
      const ehOResponsavel = !!(resp.pessoa && resp.pessoa.id === lider.id);

      // líder DIRETO exibido: quando o topo da área é o próprio diretor,
      // mostra quem está logo abaixo dele dentro da área (o diretor já
      // aparece como responsável do grupo). Sem ninguém abaixo, ele acumula.
      let liderCard = lider, liderCardExterno = liderExterno, diretosCard = diretosNaArea;
      let tagCard = ehOResponsavel ? (lider.familia || "Diretor") : "";
      if (ehOResponsavel) {
        const abaixo = membros
          .filter((m) => m.liderId === lider.id && m.id !== lider.id)
          .sort((a, b) => ord(a) - ord(b) || a.nome.localeCompare(b.nome, "pt-BR"));
        if (abaixo.length > 0) {
          liderCard = abaixo[0];
          liderCardExterno = false;
          diretosCard = diretos.get(liderCard.id) || 0;
          tagCard = "";
        }
      }

      const area = {
        id: setorId,
        nome: membros[0].setorNome || "—",
        pessoas: membros.length,
        outrosTopo: raizes.length - 1,
        lider: {
          matricula: liderCard.matricula || "",
          nome: liderCard.nome,
          cargo: liderCard.cargo || "",
          diretos: diretosCard,
          externo: liderCardExterno,
          // selo no card quando o líder É o responsável (Diretor/CFO/Presidente…)
          tag: tagCard,
        },
      };

      const chave = resp.pessoa ? resp.pessoa.id : "topo";
      if (!grupos.has(chave)) {
        const p = resp.pessoa;
        grupos.set(chave, {
          tipo: resp.tipo,
          diretor: p ? {
            matricula: p.matricula || "",
            nome: p.nome,
            cargo: p.cargo || "",
            setor: p.setorNome || "",
            respondeA: p.liderId ? (byId.get(p.liderId)?.nome || "") : "",
          } : null,
          areas: [],
        });
      }
      grupos.get(chave).areas.push(area);
    }

    const todos = [...grupos.values()];
    todos.forEach((g) => g.areas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    // presidência primeiro (nível 1), depois os diretores
    const pesoTipo = { presidencia: 0, diretor: 1 };
    const diretores = todos.filter((g) => g.diretor)
      .sort((a, b) =>
        (pesoTipo[a.tipo] ?? 9) - (pesoTipo[b.tipo] ?? 9) ||
        b.areas.length - a.areas.length ||
        a.diretor.nome.localeCompare(b.diretor.nome, "pt-BR"));
    const semDiretor = todos.find((g) => !g.diretor)?.areas || [];

    // ===== perfil de um líder: visão completa dele no organograma =====
    if (perfilMat) {
      const pessoa = rows.find((r) => r.matricula === perfilMat);
      if (!pessoa) return Response.json({ ok: false, erro: "Colaborador não encontrado." }, { status: 404 });

      // dados ricos do card (cor/variação/tipo/situação) — consulta pontual
      const [[det]] = await pool.query(
        `SELECT c.tipo_contratacao, sit.nome AS situacao,
                COALESCE(nhp.cor, nh.cor) AS cor, COALESCE(nhp.cod_var, nh.cod_var) AS cod_var
           FROM colaborador c
           LEFT JOIN cargo cg ON cg.id = c.cargo_id
           LEFT JOIN nivel_hierarquico nh ON nh.id = cg.nivel_id
           LEFT JOIN nivel_hierarquico nhp ON nhp.id = c.nivel_id
           LEFT JOIN situacao sit ON sit.id = c.situacao_id
          WHERE c.id = ? LIMIT 1`,
        [pessoa.id]
      );

      // cadeia de comando: da pessoa até o topo (com proteção contra ciclo)
      const cadeia = [];
      const vistos = new Set([pessoa.id]);
      let cur = pessoa.liderId ? byId.get(pessoa.liderId) : null;
      while (cur && !vistos.has(cur.id)) {
        vistos.add(cur.id);
        cadeia.push({ nome: cur.nome, cargo: cur.cargo || "", familia: cur.familia || "" });
        cur = cur.liderId ? byId.get(cur.liderId) : null;
      }

      const todasAreas = todos.flatMap((g) => g.areas);
      const lideraAreas = todasAreas
        .filter((a) => a.lider.matricula === perfilMat)
        .map((a) => ({ nome: a.nome, pessoas: a.pessoas }));
      const areasGeridas = (grupos.get(pessoa.id)?.areas || [])
        .map((a) => ({ nome: a.nome, liderNome: a.lider.nome }));

      const diretosArr = rows
        .filter((r) => r.liderId === pessoa.id)
        .sort((a, b) => ord(a) - ord(b) || a.nome.localeCompare(b.nome, "pt-BR"));

      return Response.json({
        ok: true,
        perfil: {
          matricula: pessoa.matricula || "",
          nome: pessoa.nome,
          cargo: pessoa.cargo || "",
          familia: pessoa.familia || "",
          cod_var: det?.cod_var || "",
          cor: det?.cor || "",
          setor: pessoa.setorNome || "",
          situacao: det?.situacao || "",
          pj: det?.tipo_contratacao === "PJ",
          cadeia,
          lideraAreas,
          areasGeridas,
          totalDiretos: diretosArr.length,
          diretos: diretosArr.slice(0, 12).map((r) => ({
            matricula: r.matricula || "", nome: r.nome, cargo: r.cargo || "", setor: r.setorNome || "",
          })),
        },
      });
    }

    // candidatos a responsável de área (trocar diretoria): presidência e
    // faixa de diretoria (níveis 1–5), únicos que podem responder por áreas
    const responsaveis = rows
      .filter((r) => r.ordem != null && r.ordem >= 1 && r.ordem <= 5)
      .sort((a, b) => ord(a) - ord(b) || a.nome.localeCompare(b.nome, "pt-BR"))
      .map((r) => ({
        matricula: r.matricula || "", nome: r.nome, cargo: r.cargo || "",
        familia: r.familia || "", setor: r.setorNome || "", nivel: r.ordem,
      }));

    return Response.json({ ok: true, diretores, semDiretor, responsaveis });
  } catch (e) {
    return erroResposta(e);
  }
}

export async function POST(req) {
  // trocar líder é edição estrutural: só ADMIN
  const bloqueio = exigirNivel(NIVEL.ADMIN);
  if (bloqueio) return bloqueio;
  let conn;
  try {
    const pool = getPool();
    const body = await req.json();

    // ---- trocar_diretor: muda a DIRETORIA da área sem tocar no líder ----
    // Regra do domínio: toda área tem um líder direto (interno ou de fora) e,
    // acima dele, um diretor. Trocar o diretor = reapontar A QUEM O LÍDER DA
    // ÁREA RESPONDE — o líder continua líder e a equipe continua nele.
    if (body.acao === "trocar_diretor") {
      const { areaId, paraMatricula } = body;
      if (!areaId || !paraMatricula) {
        return Response.json({ ok: false, erro: "Dados incompletos." }, { status: 400 });
      }
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [[dir]] = await conn.query(
        `SELECT c.id, c.nome, c.setor_id, c.lider_id,
                COALESCE(nhp.ordem, nh.ordem) AS ordem
           FROM colaborador c
           LEFT JOIN cargo cg ON cg.id = c.cargo_id
           LEFT JOIN nivel_hierarquico nh ON nh.id = cg.nivel_id
           LEFT JOIN nivel_hierarquico nhp ON nhp.id = c.nivel_id
          WHERE c.codigo_dp = ? AND c.ativo = 1 FOR UPDATE`,
        [paraMatricula]
      );
      if (!dir) { await conn.rollback(); return Response.json({ ok: false, erro: "Novo responsável não encontrado (ou inativo)." }, { status: 404 }); }
      if (dir.ordem == null || dir.ordem < 1 || dir.ordem > 5) {
        await conn.rollback();
        return Response.json({ ok: false, erro: "O responsável por uma área tem de ser diretor, presidente ou conselheiro (níveis 1–5)." }, { status: 400 });
      }

      // líder da área pela MESMA regra da tela (raiz interna única, âncora
      // externa com mais raízes, ou a raiz de nível mais alto)
      const { lider } = await liderEDiretorDaArea(pool, areaId);
      if (!lider) {
        await conn.rollback();
        return Response.json({ ok: false, erro: "A área não tem líder definido para reapontar." }, { status: 409 });
      }
      if (lider.id === dir.id) {
        await conn.rollback();
        return Response.json({ ok: false, erro: "Essa pessoa já é o líder direto da área — escolha a quem ela deve responder." }, { status: 400 });
      }

      // guarda anticiclo: se a cadeia do novo responsável passa pelo líder,
      // apontar o líder para ele criaria um laço na hierarquia
      {
        const vistos = new Set([dir.id]);
        let curId = dir.lider_id;
        while (curId && !vistos.has(curId)) {
          if (curId === lider.id) {
            await conn.rollback();
            return Response.json({ ok: false, erro: "Esse responsável responde ao líder desta área — a troca criaria um ciclo na hierarquia." }, { status: 400 });
          }
          vistos.add(curId);
          const [[cur]] = await conn.query(
            "SELECT id, lider_id, ativo FROM colaborador WHERE id = ?", [curId]
          );
          if (!cur || !cur.ativo) break;
          curId = cur.lider_id;
        }
      }

      await conn.query("UPDATE colaborador SET lider_id = ? WHERE id = ?", [dir.id, lider.id]);
      await conn.commit();
      return Response.json({ ok: true, reapontados: 1, diretorNome: dir.nome, liderNome: lider.nome });
    }

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
      `SELECT c.id, c.nome, c.setor_id, c.lider_id,
              COALESCE(nhp.ordem, nh.ordem) AS ordem
         FROM colaborador c
         LEFT JOIN cargo cg ON cg.id = c.cargo_id
         LEFT JOIN nivel_hierarquico nh ON nh.id = cg.nivel_id
         LEFT JOIN nivel_hierarquico nhp ON nhp.id = c.nivel_id
        WHERE c.codigo_dp = ? FOR UPDATE`, [deMatricula]
    );
    const [[novo]] = await conn.query(
      "SELECT id, nome, setor_id FROM colaborador WHERE codigo_dp = ? AND ativo = 1 FOR UPDATE", [paraMatricula]
    );
    if (!antigo) { await conn.rollback(); return Response.json({ ok: false, erro: "Líder atual não encontrado." }, { status: 404 }); }
    if (!novo) { await conn.rollback(); return Response.json({ ok: false, erro: "Novo líder não encontrado (ou inativo)." }, { status: 404 }); }

    // O antigo líder é o DIRETOR responsável (níveis 1–5)? Então ele fica
    // ACIMA: o novo líder passa a responder a ele, e ele não é rebaixado.
    // (Regra do domínio: área tem líder direto E diretor — trocar o líder
    // não pode transformar o diretor em subordinado do novo líder.)
    const antigoEhDiretor = antigo.ordem != null && antigo.ordem >= 1 && antigo.ordem <= 5;

    // 1. novo líder da própria área assume o posto do antigo:
    //    - antigo é o DIRETOR (membro ou externo) → novo responde ao antigo;
    //    - antigo era membro comum → novo herda o chefe dele.
    //    Quem é de fora mantém o próprio líder (vira âncora externa).
    if (novo.setor_id === areaId) {
      let novoChefe = antigoEhDiretor || antigo.setor_id !== areaId
        ? antigo.id
        : (antigo.lider_id || null);
      if (novoChefe === novo.id) novoChefe = null; // nunca auto-liderança
      await conn.query("UPDATE colaborador SET lider_id = ? WHERE id = ?", [novoChefe, novo.id]);
    }
    // 2. todos da área que respondiam ao antigo passam ao novo
    const [r] = await conn.query(
      "UPDATE colaborador SET lider_id = ? WHERE setor_id = ? AND ativo = 1 AND lider_id = ? AND id <> ?",
      [novo.id, areaId, antigo.id, novo.id]
    );
    // 3. o antigo membro comum passa a responder ao novo; o DIRETOR nunca
    //    é rebaixado — permanece acima do novo líder
    let antigoReaponta = false;
    if (antigo.setor_id === areaId && !antigoEhDiretor) {
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
