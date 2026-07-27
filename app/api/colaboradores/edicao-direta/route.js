// Edição direta a partir do card do organograma (PersonModal), só ADMIN.
// Grava nome, e-mail e local — e, quando vierem, também as mudanças
// ESTRUTURAIS (cargo, área, líder), sem passar pela aprovação do RH:
// para o admin, clicar em Salvar aplica tudo direto no banco, com o mesmo
// tratamento do fluxo "aprovar" (fecha o histórico vigente, abre um novo
// e registra cada campo em log_auditoria).
// Chave pela matrícula (codigo_dp) do card; local/cargo/área vêm por NOME
// (dropdown) e são resolvidos para o id aqui; líder vem por matrícula.
//   POST { matricula, nome, email, local, mudancas?: [{campo, de, para, paraMatricula?}] }

import { randomUUID } from "crypto";
import { getPool } from "@/lib/db";
import { normalizar } from "@/data/ti";
import { exigirNivel } from "@/lib/permissoes";
import { NIVEL } from "@/lib/perfis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req) {
  const bloqueio = exigirNivel(NIVEL.ADMIN);
  if (bloqueio) return bloqueio;
  let conn;
  try {
    const pool = getPool();
    const body = await req.json().catch(() => ({}));

    const matricula = (body.matricula || "").trim();
    if (!matricula) return Response.json({ ok: false, erro: "Colaborador não informado." }, { status: 400 });

    const nome = (body.nome || "").trim();
    if (!nome) return Response.json({ ok: false, erro: "O nome não pode ficar em branco." }, { status: 400 });

    const email = (body.email || "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ ok: false, erro: "E-mail em formato inválido." }, { status: 400 });
    }

    // resolve o colaborador pela matrícula (ou pelo UUID, caso não tenha matrícula)
    const [[c]] = await pool.query(
      "SELECT id, ativo FROM colaborador WHERE codigo_dp = ? OR id = ? LIMIT 1",
      [matricula, matricula]
    );
    if (!c) return Response.json({ ok: false, erro: "Colaborador não encontrado." }, { status: 404 });
    if (!c.ativo) {
      return Response.json({ ok: false, erro: "Colaborador desativado — reative-o para editar." }, { status: 409 });
    }

    // local por nome (opção do dropdown) → id; vazio = remove o vínculo
    let localId = null;
    const localNome = (body.local || "").trim();
    if (localNome) {
      const [[l]] = await pool.query(
        "SELECT id FROM local_trabalho WHERE nome = ? OR nome_normalizado = ? LIMIT 1",
        [localNome, normalizar(localNome)]
      );
      if (!l) return Response.json({ ok: false, erro: `Local "${localNome}" não encontrado.` }, { status: 400 });
      localId = l.id;
    }

    // mudanças estruturais (cargo/área/líder) — mesmo formato do fluxo de
    // solicitação. Resolvidas ANTES do UPDATE para validar tudo ou nada.
    const mudancas = Array.isArray(body.mudancas) ? body.mudancas : [];
    const sets = [], vals = [], logs = [];
    for (const m of mudancas) {
      if (m.campo === "cargo") {
        // só cargos já cadastrados: o código oficial vem do DP pela importação,
        // então a edição direta não cria cargo novo (evita cargo sem código)
        const [[cg]] = await pool.query(
          "SELECT id FROM cargo WHERE nome = ? OR nome_normalizado = ? LIMIT 1",
          [(m.para || "").trim(), normalizar(m.para || "")]
        );
        if (!cg) return Response.json({ ok: false, erro: `Cargo "${m.para}" não encontrado.` }, { status: 400 });
        sets.push("cargo_id = ?"); vals.push(cg.id);
        logs.push(["cargo", m.de, m.para]);
      } else if (m.campo === "area" || m.campo === "setor") {
        const [[st]] = await pool.query(
          "SELECT id FROM setor WHERE nome = ? OR nome_normalizado = ? LIMIT 1",
          [(m.para || "").trim(), normalizar(m.para || "")]
        );
        if (!st) return Response.json({ ok: false, erro: `Área "${m.para}" não encontrada.` }, { status: 400 });
        sets.push("setor_id = ?"); vals.push(st.id);
        logs.push(["setor", m.de, m.para]);
      } else if (m.campo === "lider") {
        let liderId = null; // sem matrícula = vira topo (sem líder)
        if (m.paraMatricula) {
          const [[l]] = await pool.query(
            "SELECT id FROM colaborador WHERE codigo_dp = ? OR id = ? LIMIT 1",
            [m.paraMatricula, m.paraMatricula]
          );
          if (!l) return Response.json({ ok: false, erro: "Novo líder não encontrado." }, { status: 400 });
          if (l.id === c.id) return Response.json({ ok: false, erro: "O colaborador não pode ser líder de si mesmo." }, { status: 400 });
          liderId = l.id;
        }
        sets.push("lider_id = ?"); vals.push(liderId);
        logs.push(["lider", m.de, m.para]);
      }
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query(
      "UPDATE colaborador SET nome = ?, email = ?, local_id = ? WHERE id = ?",
      [nome, email || null, localId, c.id]
    );

    if (sets.length) {
      await conn.query(`UPDATE colaborador SET ${sets.join(", ")} WHERE id = ?`, [...vals, c.id]);
      // fecha o histórico vigente e abre um novo, como no aprovar do RH
      await conn.query(
        "UPDATE colaborador_historico SET data_fim = NOW() WHERE colaborador_id = ? AND data_fim IS NULL",
        [c.id]
      );
      await conn.query(
        "INSERT INTO colaborador_historico (id, colaborador_id, cargo_id, setor_id, local_id, situacao_id, lider_id, motivo) SELECT ?, id, cargo_id, setor_id, local_id, situacao_id, lider_id, 'edicao_admin' FROM colaborador WHERE id = ?",
        [randomUUID(), c.id]
      );
      for (const [campo, antigo, novo] of logs) {
        await conn.query(
          "INSERT INTO log_auditoria (id, entidade, registro_id, campo, valor_antigo, valor_novo) VALUES (?, 'colaborador', ?, ?, ?, ?)",
          [randomUUID(), c.id, campo, antigo ?? null, novo ?? null]
        );
      }
    }

    await conn.commit();
    return Response.json({ ok: true, estruturais: sets.length > 0 });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch {} }
    const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao salvar: ${e.message}`;
    return Response.json({ ok: false, erro: msg }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}
