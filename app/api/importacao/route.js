// API da importação por Excel.
//   GET  → dados para a prévia: matrículas existentes + situações válidas
//   POST → grava a importação: upsert por matrícula + arquivamento + histórico
// Regras: CLAUDE.md seção 7. Linhas com ERRO são puladas (registradas em
// importacao_item); lookups (cargo/setor/local/regional) são criados
// automaticamente casando por nome_normalizado; situação é lista fechada.

import { randomUUID } from "crypto";
import { getPool } from "@/lib/db";
import { validarLinhas } from "@/lib/importacao";
import { normalizar } from "@/data/ti";

export const dynamic = "force-dynamic";

function erroResposta(e) {
  const msg = e?.codigo === "SEM_CONFIG"
    ? e.message
    : `Falha ao acessar o banco: ${e.message}`;
  return Response.json({ ok: false, erro: msg }, { status: 500 });
}

export async function GET() {
  try {
    const pool = getPool();
    const [colabs] = await pool.query(
      "SELECT codigo_dp FROM colaborador WHERE codigo_dp IS NOT NULL AND ativo = 1"
    );
    const [sits] = await pool.query("SELECT nome, nome_normalizado FROM situacao");
    return Response.json({
      ok: true,
      matriculas: colabs.map((c) => c.codigo_dp),
      situacoes: sits.map((s) => ({ nome: s.nome, normalizado: s.nome_normalizado })),
    });
  } catch (e) {
    return erroResposta(e);
  }
}

// garante que um valor de lookup exista (casado por nome_normalizado) e
// devolve o id. Cria automaticamente quando não existe (cargo/setor/local/
// regional). Usa cache em memória durante a transação.
async function garantirLookup(conn, tabela, nome, cache) {
  const norm = normalizar(nome);
  if (!norm) return null;
  if (cache.has(norm)) return cache.get(norm);
  const [rows] = await conn.query(
    `SELECT id FROM ${tabela} WHERE nome_normalizado = ?`, [norm]
  );
  let id = rows[0]?.id;
  if (!id) {
    id = randomUUID();
    await conn.query(
      `INSERT INTO ${tabela} (id, nome, nome_normalizado) VALUES (?, ?, ?)`,
      [id, nome.trim(), norm]
    );
  }
  cache.set(norm, id);
  return id;
}

export async function POST(req) {
  let conn;
  try {
    const { arquivoNome, linhas } = await req.json();
    if (!Array.isArray(linhas) || linhas.length === 0) {
      return Response.json({ ok: false, erro: "Nenhuma linha recebida." }, { status: 400 });
    }

    const pool = getPool();
    conn = await pool.getConnection();

    // referência atual do banco para revalidação no servidor
    const [colabs] = await conn.query(
      "SELECT id, codigo_dp, nome, email, tipo_contratacao, cargo_id, setor_id, local_id, regional_id, situacao_id, lider_id, ativo FROM colaborador WHERE codigo_dp IS NOT NULL"
    );
    const porMatricula = new Map(colabs.map((c) => [c.codigo_dp, c]));
    const [sits] = await conn.query("SELECT id, nome_normalizado FROM situacao");
    const situacaoId = new Map(sits.map((s) => [s.nome_normalizado, s.id]));

    // revalida no servidor (fonte única de verdade em lib/importacao.js)
    const { anotadas, resumo } = validarLinhas(linhas, {
      matriculasBanco: new Set(porMatricula.keys()),
      situacoesValidas: new Set(situacaoId.keys()),
    });
    const validas = anotadas.filter((l) => l.status !== "erro");

    await conn.beginTransaction();

    // cabeçalho da importação + itens (todas as linhas, inclusive puladas)
    const importacaoId = randomUUID();
    await conn.query(
      "INSERT INTO importacao (id, arquivo_nome, status, total_linhas, total_erros) VALUES (?, ?, 'processando', ?, ?)",
      [importacaoId, arquivoNome || "upload.xlsx", anotadas.length, resumo.erros]
    );
    for (const l of anotadas) {
      await conn.query(
        "INSERT INTO importacao_item (id, importacao_id, linha, payload, status, erros) VALUES (?, ?, ?, ?, ?, ?)",
        [
          randomUUID(), importacaoId, l.linha, JSON.stringify(l),
          l.status, [...l.erros, ...l.alertas].join("; ") || null,
        ]
      );
    }

    const caches = { cargo: new Map(), setor: new Map(), local_trabalho: new Map(), regional: new Map() };
    const idPorMatricula = new Map(colabs.map((c) => [c.codigo_dp, c.id]));
    let inseridos = 0, atualizados = 0;

    // 1º passo: upsert dos colaboradores (sem líder — resolvido no 2º passo)
    for (const l of validas) {
      const cargoId = l.cargo ? await garantirLookup(conn, "cargo", l.cargo, caches.cargo) : null;
      const setorId = l.setor ? await garantirLookup(conn, "setor", l.setor, caches.setor) : null;
      const localId = l.local ? await garantirLookup(conn, "local_trabalho", l.local, caches.local_trabalho) : null;
      const regionalId = l.regional ? await garantirLookup(conn, "regional", l.regional, caches.regional) : null;
      const sitId = l.situacao ? situacaoId.get(normalizar(l.situacao)) || null : null;

      const existente = porMatricula.get(l.matricula);
      if (existente) {
        const mudou =
          existente.nome !== l.nome || existente.cargo_id !== cargoId ||
          existente.setor_id !== setorId || existente.local_id !== localId ||
          existente.regional_id !== regionalId || existente.situacao_id !== sitId ||
          existente.tipo_contratacao !== l.tipo || existente.ativo !== 1;
        if (mudou) {
          await conn.query(
            `UPDATE colaborador SET nome=?, tipo_contratacao=?, cargo_id=?, setor_id=?, local_id=?, regional_id=?, situacao_id=?, ativo=1 WHERE id=?`,
            [l.nome, l.tipo, cargoId, setorId, localId, regionalId, sitId, existente.id]
          );
          // fecha o histórico vigente e abre um novo (nada sobrescreve o passado)
          await conn.query(
            "UPDATE colaborador_historico SET data_fim = NOW() WHERE colaborador_id = ? AND data_fim IS NULL",
            [existente.id]
          );
          await conn.query(
            "INSERT INTO colaborador_historico (id, colaborador_id, cargo_id, setor_id, local_id, situacao_id, motivo) VALUES (?, ?, ?, ?, ?, ?, 'importacao')",
            [randomUUID(), existente.id, cargoId, setorId, localId, sitId]
          );
          atualizados++;
        }
      } else {
        const novoId = randomUUID();
        await conn.query(
          `INSERT INTO colaborador (id, codigo_dp, nome, tipo_contratacao, cargo_id, setor_id, local_id, regional_id, situacao_id, ativo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [novoId, l.matricula, l.nome, l.tipo, cargoId, setorId, localId, regionalId, sitId]
        );
        await conn.query(
          "INSERT INTO colaborador_historico (id, colaborador_id, cargo_id, setor_id, local_id, situacao_id, motivo) VALUES (?, ?, ?, ?, ?, ?, 'importacao')",
          [randomUUID(), novoId, cargoId, setorId, localId, sitId]
        );
        idPorMatricula.set(l.matricula, novoId);
        inseridos++;
      }
    }

    // 2º passo: resolve o líder de cada linha válida (agora todos existem)
    for (const l of validas) {
      const meuId = idPorMatricula.get(l.matricula);
      const liderId = l.liderValido ? idPorMatricula.get(l.liderValido) || null : null;
      if (meuId) {
        await conn.query("UPDATE colaborador SET lider_id = ? WHERE id = ?", [liderId, meuId]);
      }
    }

    // 3º passo: arquivamento — quem está ativo no banco mas não veio no
    // arquivo vira ativo=false (soft delete) e fecha o histórico vigente
    const noArquivo = new Set(validas.map((l) => l.matricula));
    let arquivados = 0;
    for (const c of colabs) {
      if (c.ativo === 1 && !noArquivo.has(c.codigo_dp)) {
        await conn.query("UPDATE colaborador SET ativo = 0 WHERE id = ?", [c.id]);
        await conn.query(
          "UPDATE colaborador_historico SET data_fim = NOW(), motivo = CONCAT(IFNULL(motivo,''), ' | arquivado_importacao') WHERE colaborador_id = ? AND data_fim IS NULL",
          [c.id]
        );
        arquivados++;
      }
    }

    await conn.query(
      "UPDATE importacao SET status = 'confirmado' WHERE id = ?", [importacaoId]
    );
    await conn.commit();

    return Response.json({
      ok: true,
      importacaoId,
      resultado: { inseridos, atualizados, arquivados, pulados: resumo.erros, total: anotadas.length },
    });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch {} }
    return erroResposta(e);
  } finally {
    if (conn) conn.release();
  }
}
