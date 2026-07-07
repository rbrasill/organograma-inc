// API da importação por Excel — em LOTES para suportar bases grandes
// (1600+ linhas) sem estourar o tempo do servidor (504).
//   GET  → dados da prévia: matrículas existentes + situações válidas
//   POST { acao: "iniciar"  } → cria o cabeçalho da importação
//   POST { acao: "lote"     } → grava um bloco de linhas (bulk insert)
//   POST { acao: "finalizar"} → resolve líderes + arquivamento (bulk)
// Regras: CLAUDE.md seção 7. Inserts em massa e tabelas temporárias mantêm
// o número de queries baixo (dezenas, não milhares).

import { randomUUID } from "crypto";
import { getPool } from "@/lib/db";
import { normalizar } from "@/data/ti";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel: dá folga p/ os lotes maiores

function erroResposta(e) {
  const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
  return Response.json({ ok: false, erro: msg }, { status: 500 });
}

export async function GET() {
  try {
    const pool = getPool();
    const [colabs] = await pool.query(
      "SELECT codigo_dp FROM colaborador WHERE codigo_dp IS NOT NULL AND ativo = 1"
    );
    const [sits] = await pool.query("SELECT nome, nome_normalizado FROM situacao");
    const [setores] = await pool.query("SELECT nome_normalizado FROM setor");
    return Response.json({
      ok: true,
      matriculas: colabs.map((c) => c.codigo_dp),
      situacoes: sits.map((s) => ({ nome: s.nome, normalizado: s.nome_normalizado })),
      setores: setores.map((s) => s.nome_normalizado),
    });
  } catch (e) {
    return erroResposta(e);
  }
}

// garante que todos os valores de um lookup existam (casando por
// nome_normalizado); cria os que faltam num único INSERT em massa.
// dispMap: Map(nome_normalizado -> nome de exibição)
async function ensureLookups(conn, tabela, dispMap) {
  const map = new Map();
  const norms = [...dispMap.keys()];
  if (norms.length === 0) return map;
  const [rows] = await conn.query(
    `SELECT id, nome_normalizado FROM ${tabela} WHERE nome_normalizado IN (?)`, [norms]
  );
  rows.forEach((r) => map.set(r.nome_normalizado, r.id));
  const faltando = norms.filter((n) => !map.has(n));
  if (faltando.length) {
    const values = faltando.map((n) => {
      const id = randomUUID();
      map.set(n, id);
      return [id, dispMap.get(n), n];
    });
    await conn.query(`INSERT INTO ${tabela} (id, nome, nome_normalizado) VALUES ?`, [values]);
  }
  return map;
}

// insere um array de arrays em blocos (evita pacotes gigantes)
async function bulkInsert(conn, sql, linhas, tamanho = 500) {
  for (let i = 0; i < linhas.length; i += tamanho) {
    await conn.query(sql, [linhas.slice(i, i + tamanho)]);
  }
}

export async function POST(req) {
  let conn;
  try {
    const body = await req.json();
    const acao = body.acao;
    const pool = getPool();

    // ---- iniciar: cria o cabeçalho da importação ----
    if (acao === "iniciar") {
      const importacaoId = randomUUID();
      await pool.query(
        "INSERT INTO importacao (id, arquivo_nome, status, total_linhas, total_erros) VALUES (?, ?, 'processando', ?, ?)",
        [importacaoId, body.arquivoNome || "upload.xlsx", body.totalLinhas || 0, body.totalErros || 0]
      );
      return Response.json({ ok: true, importacaoId });
    }

    // ---- lote: grava um bloco de linhas válidas (bulk) ----
    if (acao === "lote") {
      const { importacaoId, linhas } = body;
      if (!Array.isArray(linhas) || linhas.length === 0) {
        return Response.json({ ok: true, inseridos: 0, atualizados: 0 });
      }
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [sits] = await conn.query("SELECT id, nome_normalizado FROM situacao");
      const situacaoId = new Map(sits.map((s) => [s.nome_normalizado, s.id]));

      // nomes distintos por lookup neste lote
      const disp = { cargo: new Map(), setor: new Map(), local_trabalho: new Map(), regional: new Map() };
      for (const l of linhas) {
        if (l.cargo) disp.cargo.set(normalizar(l.cargo), l.cargo.trim());
        if (l.setor) disp.setor.set(normalizar(l.setor), l.setor.trim());
        if (l.local) disp.local_trabalho.set(normalizar(l.local), l.local.trim());
        if (l.regional) disp.regional.set(normalizar(l.regional), l.regional.trim());
      }
      const cargoMap = await ensureLookups(conn, "cargo", disp.cargo);
      const setorMap = await ensureLookups(conn, "setor", disp.setor);
      const localMap = await ensureLookups(conn, "local_trabalho", disp.local_trabalho);
      const regMap = await ensureLookups(conn, "regional", disp.regional);

      const matriculas = linhas.map((l) => l.matricula);
      const [ex] = await conn.query(
        "SELECT id, codigo_dp, nome, cargo_id, setor_id, local_id, regional_id, situacao_id, tipo_contratacao, ativo FROM colaborador WHERE codigo_dp IN (?)",
        [matriculas]
      );
      const exMap = new Map(ex.map((c) => [c.codigo_dp, c]));

      const novos = [], hist = [], itens = [];
      let inseridos = 0, atualizados = 0;

      for (const l of linhas) {
        const cargoId = l.cargo ? cargoMap.get(normalizar(l.cargo)) || null : null;
        const setorId = l.setor ? setorMap.get(normalizar(l.setor)) || null : null;
        const localId = l.local ? localMap.get(normalizar(l.local)) || null : null;
        const regId = l.regional ? regMap.get(normalizar(l.regional)) || null : null;
        const sitId = l.situacao ? situacaoId.get(normalizar(l.situacao)) || null : null;
        const tipo = String(l.matricula).toUpperCase().startsWith("PJ") ? "PJ" : "CLT";

        const cur = exMap.get(l.matricula);
        if (cur) {
          const mudou =
            cur.nome !== l.nome || cur.cargo_id !== cargoId || cur.setor_id !== setorId ||
            cur.local_id !== localId || cur.regional_id !== regId || cur.situacao_id !== sitId ||
            cur.tipo_contratacao !== tipo || cur.ativo !== 1;
          if (mudou) {
            await conn.query(
              "UPDATE colaborador SET nome=?, tipo_contratacao=?, cargo_id=?, setor_id=?, local_id=?, regional_id=?, situacao_id=?, ativo=1 WHERE id=?",
              [l.nome, tipo, cargoId, setorId, localId, regId, sitId, cur.id]
            );
            await conn.query(
              "UPDATE colaborador_historico SET data_fim = NOW() WHERE colaborador_id = ? AND data_fim IS NULL",
              [cur.id]
            );
            hist.push([randomUUID(), cur.id, cargoId, setorId, localId, sitId, "importacao"]);
            atualizados++;
          }
        } else {
          const nid = randomUUID();
          novos.push([nid, l.matricula, l.nome, tipo, cargoId, setorId, localId, regId, sitId, 1]);
          hist.push([randomUUID(), nid, cargoId, setorId, localId, sitId, "importacao"]);
          inseridos++;
        }
        itens.push([
          randomUUID(), importacaoId, l.linha, JSON.stringify(l),
          l.status || "ok", (l.motivos || []).join("; ") || null,
        ]);
      }

      if (novos.length) await bulkInsert(conn,
        "INSERT INTO colaborador (id, codigo_dp, nome, tipo_contratacao, cargo_id, setor_id, local_id, regional_id, situacao_id, ativo) VALUES ?", novos);
      if (hist.length) await bulkInsert(conn,
        "INSERT INTO colaborador_historico (id, colaborador_id, cargo_id, setor_id, local_id, situacao_id, motivo) VALUES ?", hist);
      if (itens.length) await bulkInsert(conn,
        "INSERT INTO importacao_item (id, importacao_id, linha, payload, status, erros) VALUES ?", itens);

      await conn.commit();
      return Response.json({ ok: true, inseridos, atualizados });
    }

    // ---- finalizar: resolve líderes + arquivamento (poucas queries) ----
    if (acao === "finalizar") {
      const { importacaoId, matriculasArquivo = [], liderPares = [], erros = [] } = body;
      conn = await pool.getConnection();
      await conn.beginTransaction();

      // registra as linhas com erro (puladas) no relatório
      if (erros.length) {
        const itens = erros.map((e) => [
          randomUUID(), importacaoId, e.linha, JSON.stringify(e), "erro",
          (e.motivos || []).join("; ") || "erro",
        ]);
        await bulkInsert(conn,
          "INSERT INTO importacao_item (id, importacao_id, linha, payload, status, erros) VALUES ?", itens);
      }

      await conn.query("DROP TEMPORARY TABLE IF EXISTS _imp_file");
      await conn.query("DROP TEMPORARY TABLE IF EXISTS _imp_lider");
      await conn.query("CREATE TEMPORARY TABLE _imp_file (m VARCHAR(40) PRIMARY KEY)");
      await conn.query("CREATE TEMPORARY TABLE _imp_lider (m VARCHAR(40), l VARCHAR(40), KEY(m), KEY(l))");

      if (matriculasArquivo.length)
        await bulkInsert(conn, "INSERT IGNORE INTO _imp_file (m) VALUES ?",
          matriculasArquivo.map((m) => [m]));
      if (liderPares.length)
        await bulkInsert(conn, "INSERT INTO _imp_lider (m, l) VALUES ?", liderPares);

      // define o líder de quem tem par válido
      await conn.query(
        `UPDATE colaborador c
           JOIN _imp_lider t ON t.m = c.codigo_dp
           JOIN colaborador l ON l.codigo_dp = t.l
            SET c.lider_id = l.id`
      );
      // quem veio no arquivo mas sem par válido → sem líder (raiz)
      await conn.query(
        `UPDATE colaborador c
           JOIN _imp_file f ON f.m = c.codigo_dp
           LEFT JOIN _imp_lider t ON t.m = c.codigo_dp
            SET c.lider_id = NULL
          WHERE t.m IS NULL`
      );
      // arquivamento: quem estava ativo e não veio no arquivo
      const [arq] = await conn.query(
        `UPDATE colaborador c
           LEFT JOIN _imp_file f ON f.m = c.codigo_dp
            SET c.ativo = 0
          WHERE c.ativo = 1 AND f.m IS NULL AND c.codigo_dp IS NOT NULL`
      );
      await conn.query(
        `UPDATE colaborador_historico h
           JOIN colaborador c ON c.id = h.colaborador_id
           LEFT JOIN _imp_file f ON f.m = c.codigo_dp
            SET h.data_fim = NOW()
          WHERE h.data_fim IS NULL AND c.ativo = 0 AND f.m IS NULL AND c.codigo_dp IS NOT NULL`
      );

      await conn.query("DROP TEMPORARY TABLE IF EXISTS _imp_file");
      await conn.query("DROP TEMPORARY TABLE IF EXISTS _imp_lider");
      await conn.query("UPDATE importacao SET status = 'confirmado' WHERE id = ?", [importacaoId]);
      await conn.commit();

      return Response.json({ ok: true, arquivados: arq.affectedRows || 0 });
    }

    return Response.json({ ok: false, erro: "Ação desconhecida." }, { status: 400 });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch {} }
    return erroResposta(e);
  } finally {
    if (conn) conn.release();
  }
}
