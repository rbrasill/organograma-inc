// Solicitações de ajuste (estruturais) — o líder abre pelo modal do
// colaborador; o RH revisa e aprova/devolve na página /solicitacoes.
//   GET [?status=] → lista (com dados do alvo e valores atuais)
//   POST { acao: "criar",   ... }   → cria uma solicitação pendente
//   POST { acao: "aprovar", id }     → aplica as mudanças no colaborador
//                                       (+ histórico + auditoria) e marca aprovada
//   POST { acao: "devolver", id, observacao } → marca devolvida com observação
// Sem autenticação ainda: solicitante/aprovador ficam como texto no payload.

import { randomUUID } from "crypto";
import { getPool } from "@/lib/db";
import { normalizar } from "@/data/ti";

export const dynamic = "force-dynamic";

function erroResposta(e) {
  const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
  return Response.json({ ok: false, erro: msg }, { status: 500 });
}

function parsePayload(p) {
  if (!p) return {};
  if (typeof p === "object") return p;
  try { return JSON.parse(p); } catch { return {}; }
}

export async function GET(req) {
  try {
    const pool = getPool();
    const url = new URL(req.url);

    // modo leve para o POLLING do badge (HeroNav, a cada 45s por aba):
    // só o COUNT de pendentes, sem a listagem com JOINs
    if (url.searchParams.get("contagem") === "1") {
      const [[cont]] = await pool.query(
        "SELECT COUNT(*) AS pendentes FROM solicitacao_ajuste WHERE status = 'pendente'"
      );
      return Response.json({ ok: true, pendentes: Number(cont.pendentes) });
    }

    const status = url.searchParams.get("status");
    const cond = status && status !== "todas" ? "WHERE s.status = ?" : "";
    const args = status && status !== "todas" ? [status] : [];
    const [rows] = await pool.query(
      `SELECT s.id, s.tipo, s.status, s.payload, s.data_decisao, s.criado_em,
              c.nome AS alvo_nome, c.codigo_dp AS alvo_matricula,
              cg.nome AS cargo_atual, st.nome AS setor_atual, sit.nome AS situacao_atual,
              ld.nome AS lider_atual
         FROM solicitacao_ajuste s
         LEFT JOIN colaborador c   ON c.id = s.colaborador_alvo_id
         LEFT JOIN cargo cg        ON cg.id = c.cargo_id
         LEFT JOIN setor st        ON st.id = c.setor_id
         LEFT JOIN situacao sit    ON sit.id = c.situacao_id
         LEFT JOIN colaborador ld  ON ld.id = c.lider_id
         ${cond}
        ORDER BY (s.status = 'pendente') DESC, s.criado_em DESC`,
      args
    );
    const [[cont]] = await pool.query(
      "SELECT COUNT(*) AS pendentes FROM solicitacao_ajuste WHERE status = 'pendente'"
    );
    return Response.json({
      ok: true,
      pendentes: Number(cont.pendentes),
      solicitacoes: rows.map((r) => ({
        id: r.id, tipo: r.tipo, status: r.status,
        criadoEm: r.criado_em, dataDecisao: r.data_decisao,
        alvo: { nome: r.alvo_nome, matricula: r.alvo_matricula },
        atual: { cargo: r.cargo_atual, setor: r.setor_atual, situacao: r.situacao_atual, lider: r.lider_atual },
        payload: parsePayload(r.payload),
      })),
    });
  } catch (e) {
    return erroResposta(e);
  }
}

async function ensureLookup(conn, tabela, nome) {
  const norm = normalizar(nome || "");
  if (!norm) return null;
  const [rows] = await conn.query(`SELECT id FROM ${tabela} WHERE nome_normalizado = ?`, [norm]);
  if (rows[0]) return rows[0].id;
  const id = randomUUID();
  await conn.query(`INSERT INTO ${tabela} (id, nome, nome_normalizado) VALUES (?, ?, ?)`, [id, nome.trim(), norm]);
  return id;
}

export async function POST(req) {
  let conn;
  try {
    const body = await req.json();
    const pool = getPool();

    // ---- criar (aberta pelo modal do colaborador) ----
    if (body.acao === "criar") {
      const { matricula, alvoNome, solicitanteNome, observacao, mudancas, tipo } = body;
      if (!matricula || !Array.isArray(mudancas) || mudancas.length === 0) {
        return Response.json({ ok: false, erro: "Nada a solicitar (nenhuma mudança estrutural)." }, { status: 400 });
      }
      const [[alvo]] = await pool.query("SELECT id FROM colaborador WHERE codigo_dp = ?", [matricula]);
      if (!alvo) return Response.json({ ok: false, erro: "Colaborador não encontrado no banco." }, { status: 404 });
      const payload = { alvo: { matricula, nome: alvoNome }, solicitante: solicitanteNome || "—", observacao: observacao || "", mudancas };
      await pool.query(
        "INSERT INTO solicitacao_ajuste (id, tipo, colaborador_alvo_id, payload, status) VALUES (?, ?, ?, ?, 'pendente')",
        [randomUUID(), tipo || "correcao_vinculo", alvo.id, JSON.stringify(payload)]
      );
      return Response.json({ ok: true });
    }

    // ---- aprovar: aplica as mudanças no colaborador ----
    if (body.acao === "aprovar") {
      conn = await pool.getConnection();
      await conn.beginTransaction();
      const [[sol]] = await conn.query(
        "SELECT id, colaborador_alvo_id, payload, status FROM solicitacao_ajuste WHERE id = ? FOR UPDATE", [body.id]
      );
      if (!sol) { await conn.rollback(); return Response.json({ ok: false, erro: "Solicitação não encontrada." }, { status: 404 }); }
      if (sol.status !== "pendente") { await conn.rollback(); return Response.json({ ok: false, erro: "Solicitação já decidida." }, { status: 409 }); }

      const payload = parsePayload(sol.payload);
      const alvoId = sol.colaborador_alvo_id;
      const [[atual]] = await conn.query(
        `SELECT c.*, cg.nome cargo_nome, st.nome setor_nome, sit.nome sit_nome, ld.nome lider_nome
           FROM colaborador c
           LEFT JOIN cargo cg ON cg.id=c.cargo_id LEFT JOIN setor st ON st.id=c.setor_id
           LEFT JOIN situacao sit ON sit.id=c.situacao_id LEFT JOIN colaborador ld ON ld.id=c.lider_id
          WHERE c.id = ?`, [alvoId]
      );
      if (!atual) { await conn.rollback(); return Response.json({ ok: false, erro: "Colaborador alvo não existe mais." }, { status: 404 }); }

      const sets = [], vals = [], logs = [];
      for (const m of payload.mudancas || []) {
        if (m.campo === "cargo") {
          const id = await ensureLookup(conn, "cargo", m.para);
          sets.push("cargo_id = ?"); vals.push(id);
          logs.push(["cargo", atual.cargo_nome, m.para]);
        } else if (m.campo === "area" || m.campo === "setor") {
          const id = await ensureLookup(conn, "setor", m.para);
          sets.push("setor_id = ?"); vals.push(id);
          logs.push(["setor", atual.setor_nome, m.para]);
        } else if (m.campo === "situacao") {
          const [[s]] = await conn.query("SELECT id FROM situacao WHERE nome_normalizado = ?", [normalizar(m.para || "")]);
          sets.push("situacao_id = ?"); vals.push(s?.id || null);
          logs.push(["situacao", atual.sit_nome, m.para]);
        } else if (m.campo === "lider") {
          let liderId = null;
          if (m.paraMatricula) {
            const [[l]] = await conn.query("SELECT id FROM colaborador WHERE codigo_dp = ?", [m.paraMatricula]);
            liderId = l?.id || null;
          }
          sets.push("lider_id = ?"); vals.push(liderId);
          logs.push(["lider", atual.lider_nome, m.para]);
        }
      }

      if (sets.length) {
        await conn.query(`UPDATE colaborador SET ${sets.join(", ")} WHERE id = ?`, [...vals, alvoId]);
        // fecha o histórico vigente e abre um novo
        await conn.query("UPDATE colaborador_historico SET data_fim = NOW() WHERE colaborador_id = ? AND data_fim IS NULL", [alvoId]);
        await conn.query(
          "INSERT INTO colaborador_historico (id, colaborador_id, cargo_id, setor_id, local_id, situacao_id, lider_id, motivo) SELECT ?, id, cargo_id, setor_id, local_id, situacao_id, lider_id, 'ajuste_aprovado' FROM colaborador WHERE id = ?",
          [randomUUID(), alvoId]
        );
        for (const [campo, antigo, novo] of logs) {
          await conn.query(
            "INSERT INTO log_auditoria (id, entidade, registro_id, campo, valor_antigo, valor_novo) VALUES (?, 'colaborador', ?, ?, ?, ?)",
            [randomUUID(), alvoId, campo, antigo ?? null, novo ?? null]
          );
        }
      }

      await conn.query("UPDATE solicitacao_ajuste SET status = 'aprovada', data_decisao = NOW() WHERE id = ?", [body.id]);
      await conn.commit();
      return Response.json({ ok: true });
    }

    // ---- devolver: registra a devolução com observação ----
    if (body.acao === "devolver") {
      const [[sol]] = await pool.query("SELECT payload, status FROM solicitacao_ajuste WHERE id = ?", [body.id]);
      if (!sol) return Response.json({ ok: false, erro: "Solicitação não encontrada." }, { status: 404 });
      if (sol.status !== "pendente") return Response.json({ ok: false, erro: "Solicitação já decidida." }, { status: 409 });
      const payload = parsePayload(sol.payload);
      payload.decisao = body.observacao || "Devolvida sem observação.";
      await pool.query(
        "UPDATE solicitacao_ajuste SET status = 'devolvida', data_decisao = NOW(), payload = ? WHERE id = ?",
        [JSON.stringify(payload), body.id]
      );
      return Response.json({ ok: true });
    }

    return Response.json({ ok: false, erro: "Ação desconhecida." }, { status: 400 });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch {} }
    return erroResposta(e);
  } finally {
    if (conn) conn.release();
  }
}
