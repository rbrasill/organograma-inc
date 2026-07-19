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
import { localComCodigo, normalizarCodigoLocal, cargoNormalizado } from "@/lib/importacao";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel: dá folga p/ os lotes maiores

function erroResposta(e) {
  const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
  return Response.json({ ok: false, erro: msg }, { status: 500 });
}

export async function GET() {
  try {
    const pool = getPool();
    // só CLT: PJ nunca entra na comparação nem na lista de arquivamento
    const [colabs] = await pool.query(
      "SELECT codigo_dp FROM colaborador WHERE codigo_dp IS NOT NULL AND ativo = 1 AND tipo_contratacao = 'CLT'"
    );
    const [sits] = await pool.query("SELECT nome, nome_normalizado, codigo_dp FROM situacao");
    const [setores] = await pool.query("SELECT nome_normalizado, codigo_dp FROM setor");
    return Response.json({
      ok: true,
      matriculas: colabs.map((c) => c.codigo_dp),
      situacoes: sits.map((s) => ({ nome: s.nome, normalizado: s.nome_normalizado, codigo: s.codigo_dp })),
      setores: setores.map((s) => ({ normalizado: s.nome_normalizado, codigo: s.codigo_dp })),
    });
  } catch (e) {
    return erroResposta(e);
  }
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

      // catálogos completos em memória (poucas centenas de linhas). Casamento
      // por CÓDIGO oficial (mais robusto) com fallback por nome_normalizado.
      const [setRows] = await conn.query("SELECT id, codigo_dp, nome_normalizado FROM setor");
      const [locRows] = await conn.query("SELECT id, codigo_dp, nome_normalizado FROM local_trabalho");
      const [sitRows] = await conn.query("SELECT id, codigo_dp, nome_normalizado FROM situacao");
      const [carRows] = await conn.query("SELECT id, nome_normalizado FROM cargo");
      const [regRows] = await conn.query("SELECT id, nome_normalizado FROM regional");
      const [nhRows]  = await conn.query("SELECT id, codigo_nh FROM nivel_hierarquico");

      const setCod = new Map(), setNome = new Map();
      setRows.forEach((r) => { if (r.codigo_dp) setCod.set(r.codigo_dp, r.id); setNome.set(r.nome_normalizado, r.id); });
      const locCod = new Map(), locNome = new Map();
      locRows.forEach((r) => { if (r.codigo_dp) locCod.set(r.codigo_dp, r.id); locNome.set(r.nome_normalizado, r.id); });
      const sitCod = new Map(), sitNome = new Map();
      sitRows.forEach((r) => { if (r.codigo_dp) sitCod.set(String(r.codigo_dp).toLowerCase(), r.id); sitNome.set(r.nome_normalizado, r.id); });
      const carNome = new Map(carRows.map((r) => [r.nome_normalizado, r.id]));
      const regNome = new Map(regRows.map((r) => [r.nome_normalizado, r.id]));
      const nhId = new Map(nhRows.map((r) => [r.codigo_nh, r.id]));

      // local no formato novo do DP ("472 - Reserva JK"): deriva o código do
      // DP do prefixo quando a coluna de código não veio, e guarda o nome
      // limpo para o caso de o local ser criado aqui. Códigos LOCTRA… de
      // arquivos antigos são normalizados para o número (migração 06).
      // (o cliente já faz isso na prévia; refazer no servidor protege
      // chamadas diretas à API)
      for (const l of linhas) {
        l.codigoLocal = normalizarCodigoLocal(l.codigoLocal);
        if (!l.codigoLocal) {
          const p = localComCodigo(l.local);
          if (p) { l.codigoLocal = p.codigo; l.localNomeLimpo = p.nome; }
        }
      }

      // pré-cria lookups ausentes no lote (raro na v2, tudo já semeado).
      // situacao é lista fechada: nunca cria.
      const novoSet = [], novoLoc = [], novoCar = [], novoReg = [];
      for (const l of linhas) {
        const sNorm = l.setor ? normalizar(l.setor) : null;
        if ((l.codigoSetor || sNorm) && !(l.codigoSetor && setCod.has(l.codigoSetor)) && !(sNorm && setNome.has(sNorm))) {
          const id = randomUUID(); const nome = (l.setor || l.codigoSetor).trim(); const norm = sNorm || normalizar(nome);
          novoSet.push([id, l.codigoSetor || null, nome, norm]);
          if (l.codigoSetor) setCod.set(l.codigoSetor, id); setNome.set(norm, id);
        }
        const loNorm = l.local ? normalizar(l.local) : null;
        if ((l.codigoLocal || loNorm) && !(l.codigoLocal && locCod.has(l.codigoLocal)) && !(loNorm && locNome.has(loNorm))) {
          const id = randomUUID();
          const nome = (l.localNomeLimpo || l.local || l.codigoLocal).trim(); // sem o prefixo numérico
          const norm = normalizar(nome);
          novoLoc.push([id, l.codigoLocal || null, nome, norm]);
          if (l.codigoLocal) locCod.set(l.codigoLocal, id); locNome.set(norm, id);
        }
        // cargo casa por nome com alias do DP (grafias abreviadas → canônico)
        const cNorm = l.cargo ? cargoNormalizado(l.cargo) : null;
        if (cNorm && !carNome.has(cNorm)) {
          const id = randomUUID(); const nivelId = l.codigoNH ? (nhId.get(l.codigoNH) || null) : null;
          novoCar.push([id, l.codigoCargo || null, l.cargo.trim().replace(/\s+/g, " "), cNorm, nivelId]);
          carNome.set(cNorm, id);
        }
        const rNorm = l.regional ? normalizar(l.regional) : null;
        if (rNorm && !regNome.has(rNorm)) {
          const id = randomUUID();
          novoReg.push([id, l.regional.trim(), rNorm]);
          regNome.set(rNorm, id);
        }
      }
      if (novoSet.length) await bulkInsert(conn, "INSERT INTO setor (id, codigo_dp, nome, nome_normalizado) VALUES ?", novoSet);
      if (novoLoc.length) await bulkInsert(conn, "INSERT INTO local_trabalho (id, codigo_dp, nome, nome_normalizado) VALUES ?", novoLoc);
      if (novoCar.length) await bulkInsert(conn, "INSERT INTO cargo (id, codigo_cargo_dp, nome, nome_normalizado, nivel_id) VALUES ?", novoCar);
      if (novoReg.length) await bulkInsert(conn, "INSERT INTO regional (id, nome, nome_normalizado) VALUES ?", novoReg);

      const matriculas = linhas.map((l) => l.matricula);
      const [ex] = await conn.query(
        `SELECT id, codigo_dp, nome, cpf, cargo_id, setor_id, local_id, regional_id, situacao_id,
                tipo_contratacao, ativo,
                DATE_FORMAT(data_nascimento, '%Y-%m-%d') AS data_nascimento,
                DATE_FORMAT(data_admissao, '%Y-%m-%d') AS data_admissao
           FROM colaborador WHERE codigo_dp IN (?)`,
        [matriculas]
      );
      const exMap = new Map(ex.map((c) => [c.codigo_dp, c]));

      const novos = [], hist = [], itens = [];
      let inseridos = 0, atualizados = 0;

      for (const l of linhas) {
        // resolve por código (v2), com fallback por nome normalizado
        const setorId = (l.codigoSetor && setCod.get(l.codigoSetor)) || (l.setor && setNome.get(normalizar(l.setor))) || null;
        const localId = (l.codigoLocal && locCod.get(l.codigoLocal)) || (l.local && locNome.get(normalizar(l.local))) || null;
        const sitId   = (l.codigoSituacao && sitCod.get(String(l.codigoSituacao).toLowerCase())) || (l.situacao && sitNome.get(normalizar(l.situacao))) || null;
        const cargoId = l.cargo ? carNome.get(cargoNormalizado(l.cargo)) || null : null;
        const regId   = l.regional ? regNome.get(normalizar(l.regional)) || null : null;
        // tipo de contratação: coluna explícita da v2; fallback = prefixo "PJ"
        const tipo = l.tipo
          ? (normalizar(l.tipo).includes("pj") ? "PJ" : "CLT")
          : (String(l.matricula).toUpperCase().startsWith("PJ") ? "PJ" : "CLT");

        // REGRA: nenhum campo é sobrescrito com vazio — o que não vem no
        // arquivo (CPF em branco, setor/regional ausentes no extrato v3,
        // datas ilegíveis) PRESERVA o valor atual do banco (COALESCE).
        const cpfNovo = (l.cpf || "").trim() || null;
        const nasc = l.dataNascimento || null; // já em ISO (cliente valida)
        const adm = l.dataAdmissao || null;

        const cur = exMap.get(l.matricula);
        if (cur) {
          // "mudou" só quando o arquivo TRAZ um valor e ele difere do atual
          const diff = (novo, atual) => novo !== null && novo !== undefined && novo !== "" && novo !== atual;
          const mudou =
            diff(l.nome, cur.nome) || diff(cargoId, cur.cargo_id) || diff(setorId, cur.setor_id) ||
            diff(localId, cur.local_id) || diff(regId, cur.regional_id) || diff(sitId, cur.situacao_id) ||
            cur.ativo !== 1 || diff(cpfNovo, cur.cpf) ||
            diff(nasc, cur.data_nascimento) || diff(adm, cur.data_admissao);
          if (mudou) {
            // tipo_contratacao NUNCA é alterado em registro existente (regra 4)
            await conn.query(
              `UPDATE colaborador SET
                 nome = COALESCE(?, nome), cpf = COALESCE(?, cpf),
                 data_nascimento = COALESCE(?, data_nascimento),
                 data_admissao = COALESCE(?, data_admissao),
                 cargo_id = COALESCE(?, cargo_id), setor_id = COALESCE(?, setor_id),
                 local_id = COALESCE(?, local_id), regional_id = COALESCE(?, regional_id),
                 situacao_id = COALESCE(?, situacao_id), ativo = 1
               WHERE id = ?`,
              [l.nome || null, cpfNovo, nasc, adm, cargoId, setorId, localId, regId, sitId, cur.id]
            );
            await conn.query(
              "UPDATE colaborador_historico SET data_fim = NOW() WHERE colaborador_id = ? AND data_fim IS NULL",
              [cur.id]
            );
            hist.push([randomUUID(), cur.id, cargoId ?? cur.cargo_id, setorId ?? cur.setor_id, localId ?? cur.local_id, sitId ?? cur.situacao_id, "importacao"]);
            atualizados++;
          }
        } else {
          const nid = randomUUID();
          novos.push([nid, l.matricula, l.nome, cpfNovo, nasc, adm, tipo, cargoId, setorId, localId, regId, sitId, 1]);
          hist.push([randomUUID(), nid, cargoId, setorId, localId, sitId, "importacao"]);
          inseridos++;
        }
        itens.push([
          randomUUID(), importacaoId, l.linha, JSON.stringify(l),
          l.status || "ok", (l.motivos || []).join("; ") || null,
        ]);
      }

      if (novos.length) await bulkInsert(conn,
        "INSERT INTO colaborador (id, codigo_dp, nome, cpf, data_nascimento, data_admissao, tipo_contratacao, cargo_id, setor_id, local_id, regional_id, situacao_id, ativo) VALUES ?", novos);
      if (hist.length) await bulkInsert(conn,
        "INSERT INTO colaborador_historico (id, colaborador_id, cargo_id, setor_id, local_id, situacao_id, motivo) VALUES ?", hist);
      if (itens.length) await bulkInsert(conn,
        "INSERT INTO importacao_item (id, importacao_id, linha, payload, status, erros) VALUES ?", itens);

      await conn.commit();
      return Response.json({ ok: true, inseridos, atualizados });
    }

    // ---- finalizar: resolve líderes + arquivamento (poucas queries) ----
    if (acao === "finalizar") {
      // temLider=false (extrato v3, sem coluna de líder): a importação NÃO
      // mexe em nenhum lider_id — a árvore é gerida dentro do portal.
      const { importacaoId, matriculasArquivo = [], liderPares = [], erros = [], temLider = true } = body;
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

      if (temLider) {
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
      }
      // arquivamento: CLT ativo que não veio no arquivo. PJ NUNCA é
      // arquivado por importação (gestão exclusiva pelo menu PJ).
      const [arq] = await conn.query(
        `UPDATE colaborador c
           LEFT JOIN _imp_file f ON f.m = c.codigo_dp
            SET c.ativo = 0
          WHERE c.ativo = 1 AND f.m IS NULL AND c.codigo_dp IS NOT NULL
            AND c.tipo_contratacao = 'CLT'`
      );
      await conn.query(
        `UPDATE colaborador_historico h
           JOIN colaborador c ON c.id = h.colaborador_id
           LEFT JOIN _imp_file f ON f.m = c.codigo_dp
            SET h.data_fim = NOW()
          WHERE h.data_fim IS NULL AND c.ativo = 0 AND f.m IS NULL AND c.codigo_dp IS NOT NULL
            AND c.tipo_contratacao = 'CLT'`
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
