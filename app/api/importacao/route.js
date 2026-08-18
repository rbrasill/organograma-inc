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
import { localComCodigo, normalizarCodigoLocal, cargoNormalizado, normalizarCodigoCargo, familiaDoCargo } from "@/lib/importacao";
import { exigirNivel } from "@/lib/permissoes";
import { NIVEL } from "@/lib/perfis";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel: dá folga p/ os lotes maiores

function erroResposta(e) {
  const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
  return Response.json({ ok: false, erro: msg }, { status: 500 });
}

export async function GET() {
  const bloqueio = exigirNivel(NIVEL.ADMIN);
  if (bloqueio) return bloqueio;
  try {
    const pool = getPool();
    // só CLT: PJ nunca entra na comparação nem na lista de arquivamento.
    // A identidade é o CPF (a chapa pode mudar no DP) — a prévia usa os pares
    // cpf+matrícula para calcular novos × atualizados × a arquivar.
    const [colabs] = await pool.query(
      "SELECT cpf, codigo_dp FROM colaborador WHERE ativo = 1 AND tipo_contratacao = 'CLT'"
    );
    const [sits] = await pool.query("SELECT nome, nome_normalizado, codigo_dp FROM situacao");
    const [setores] = await pool.query("SELECT nome_normalizado, codigo_dp FROM setor");
    const [cargos] = await pool.query("SELECT codigo_cargo_dp, nome, nome_normalizado FROM cargo");
    const [locais] = await pool.query("SELECT codigo_dp, nome, nome_normalizado FROM local_trabalho");
    return Response.json({
      ok: true,
      clt: colabs.map((c) => ({ cpf: c.cpf || "", matricula: c.codigo_dp || "" })),
      matriculas: colabs.map((c) => c.codigo_dp).filter(Boolean), // validação de líder (arquivos v2)
      situacoes: sits.map((s) => ({ nome: s.nome, normalizado: s.nome_normalizado, codigo: s.codigo_dp })),
      setores: setores.map((s) => ({ normalizado: s.nome_normalizado, codigo: s.codigo_dp })),
      cargos: cargos.map((c) => ({ codigo: c.codigo_cargo_dp, nome: c.nome, normalizado: c.nome_normalizado })),
      locais: locais.map((l) => ({ codigo: l.codigo_dp, nome: l.nome, normalizado: l.nome_normalizado })),
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
  const bloqueio = exigirNivel(NIVEL.ADMIN);
  if (bloqueio) return bloqueio;
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
      const [locRows] = await conn.query("SELECT id, codigo_dp, nome_normalizado, regional_id FROM local_trabalho");
      const [sitRows] = await conn.query("SELECT id, codigo_dp, nome_normalizado FROM situacao");
      const [carRows] = await conn.query("SELECT id, codigo_cargo_dp, nome, nome_normalizado FROM cargo");
      const [regRows] = await conn.query("SELECT id, nome_normalizado FROM regional");
      const [nhRows]  = await conn.query("SELECT id, codigo_nh, familia FROM nivel_hierarquico");

      const setCod = new Map(), setNome = new Map();
      setRows.forEach((r) => { if (r.codigo_dp) setCod.set(r.codigo_dp, r.id); setNome.set(r.nome_normalizado, r.id); });
      const locCod = new Map(), locNome = new Map();
      locRows.forEach((r) => { if (r.codigo_dp) locCod.set(r.codigo_dp, r.id); locNome.set(r.nome_normalizado, r.id); });
      // regional de cada local (mig. 12): a regional do colaborador SEGUE o
      // local; local sem regional adota a do arquivo na primeira linha que o citar
      const locReg = new Map(locRows.map((r) => [r.id, r.regional_id || null]));
      const sitCod = new Map(), sitNome = new Map();
      sitRows.forEach((r) => { if (r.codigo_dp) sitCod.set(String(r.codigo_dp).toLowerCase(), r.id); sitNome.set(r.nome_normalizado, r.id); });
      // CARGO: o CÓDIGO do DP é a identidade (mig. 10); nome é fallback
      const carNome = new Map(carRows.map((r) => [r.nome_normalizado, r.id]));
      const carCod = new Map(); // código normalizado -> { id, nome, norm }
      carRows.forEach((r) => {
        const k = normalizarCodigoCargo(r.codigo_cargo_dp);
        if (k) carCod.set(k, { id: r.id, nome: r.nome, norm: r.nome_normalizado });
      });
      const regNome = new Map(regRows.map((r) => [r.nome_normalizado, r.id]));
      const nhId = new Map(nhRows.map((r) => [r.codigo_nh, r.id]));
      const familias = nhRows.filter((r) => r.familia); // p/ nível automático de cargo novo

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
        // CARGO — identidade pelo código do DP (mig. 10):
        //  * código existe no catálogo + nome diverge → RENOMEIA (o DP manda
        //    no nome), a menos que o nome novo colida com outro cargo;
        //  * código não existe + nome existe → cargo legado ADOTA o código;
        //  * código não existe + nome não existe → CRIA, já com o nível
        //    assimilado pela família do nome (prefixo mais longo);
        //  * sem código (arquivos antigos) → fallback por nome, como antes.
        const cNorm = l.cargo ? cargoNormalizado(l.cargo) : null;
        const cCod = normalizarCodigoCargo(l.codigoCargo);
        const nomeLimpo = l.cargo ? l.cargo.trim().replace(/\s+/g, " ") : "";
        if (cCod && cNorm) {
          const atual = carCod.get(cCod);
          if (atual) {
            if (atual.nome !== nomeLimpo) {
              const donoNome = carNome.get(cNorm);
              if (donoNome && donoNome !== atual.id) {
                l.motivos = [...(l.motivos || []), `Cargo cód. ${l.codigoCargo}: rename para "${nomeLimpo}" colidiria com outro cargo — nome atual mantido`];
              } else {
                await conn.query("UPDATE cargo SET nome = ?, nome_normalizado = ? WHERE id = ?", [nomeLimpo, cNorm, atual.id]);
                carNome.delete(atual.norm);
                carNome.set(cNorm, atual.id);
                carCod.set(cCod, { id: atual.id, nome: nomeLimpo, norm: cNorm });
              }
            }
          } else if (carNome.has(cNorm)) {
            const id = carNome.get(cNorm); // cargo legado sem código: adota
            await conn.query("UPDATE cargo SET codigo_cargo_dp = ? WHERE id = ?", [l.codigoCargo.trim(), id]);
            carCod.set(cCod, { id, nome: nomeLimpo, norm: cNorm });
          } else {
            const id = randomUUID();
            const nivelId = (l.codigoNH && nhId.get(l.codigoNH)) || familiaDoCargo(nomeLimpo, familias)?.id || null;
            novoCar.push([id, l.codigoCargo.trim(), nomeLimpo, cNorm, nivelId]);
            carNome.set(cNorm, id);
            carCod.set(cCod, { id, nome: nomeLimpo, norm: cNorm });
          }
        } else if (cNorm && !carNome.has(cNorm)) {
          const id = randomUUID();
          const nivelId = (l.codigoNH && nhId.get(l.codigoNH)) || familiaDoCargo(nomeLimpo, familias)?.id || null;
          novoCar.push([id, null, nomeLimpo, cNorm, nivelId]);
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

      // IDENTIDADE PELO CPF: a chapa pode mudar no DP; o CPF nunca. O lookup
      // vem ordenado do "melhor" candidato para o pior (ativo primeiro, depois
      // admissão mais recente) — com CPF duplicado no banco (recontratação),
      // o primeiro da ordem é o que recebe a atualização.
      const cpfs = linhas.map((l) => l.cpf).filter(Boolean);
      const [ex] = await conn.query(
        `SELECT id, codigo_dp, nome, cpf, cargo_id, setor_id, local_id, regional_id, situacao_id,
                tipo_contratacao, ativo, sexo, pcd,
                DATE_FORMAT(data_nascimento, '%Y-%m-%d') AS data_nascimento,
                DATE_FORMAT(data_admissao, '%Y-%m-%d') AS data_admissao
           FROM colaborador WHERE cpf IN (?)
          ORDER BY ativo DESC, data_admissao DESC, criado_em DESC`,
        [cpfs.length ? cpfs : [""]]
      );
      const exMap = new Map();
      for (const c of ex) if (!exMap.has(c.cpf)) exMap.set(c.cpf, c);

      // dono atual de cada CHAPA do lote (para a troca de chapa não colidir
      // com a UNIQUE quando a chapa pertencer a OUTRO CPF)
      const matriculas = linhas.map((l) => l.matricula).filter(Boolean);
      const [donos] = await conn.query(
        "SELECT id, codigo_dp, cpf FROM colaborador WHERE codigo_dp IN (?)",
        [matriculas.length ? matriculas : [""]]
      );
      const chapaDono = new Map(donos.map((d) => [d.codigo_dp, d]));

      const novos = [], hist = [], itens = [];
      let inseridos = 0, atualizados = 0;

      for (const l of linhas) {
        // resolve por código (v2), com fallback por nome normalizado
        const setorId = (l.codigoSetor && setCod.get(l.codigoSetor)) || (l.setor && setNome.get(normalizar(l.setor))) || null;
        const localId = (l.codigoLocal && locCod.get(l.codigoLocal)) || (l.local && locNome.get(normalizar(l.local))) || null;
        const sitId   = (l.codigoSituacao && sitCod.get(String(l.codigoSituacao).toLowerCase())) || (l.situacao && sitNome.get(normalizar(l.situacao))) || null;
        const cargoId =
          (normalizarCodigoCargo(l.codigoCargo) && carCod.get(normalizarCodigoCargo(l.codigoCargo))?.id) ||
          (l.cargo ? carNome.get(cargoNormalizado(l.cargo)) || null : null);
        let regId    = l.regional ? regNome.get(normalizar(l.regional)) || null : null;
        // a regional SEGUE o local: se o local tem regional, ela vale; se
        // ainda não tem (local recém-criado ou legado), adota a do arquivo
        if (localId) {
          if (!locReg.get(localId) && regId) {
            await conn.query("UPDATE local_trabalho SET regional_id = ? WHERE id = ?", [regId, localId]);
            locReg.set(localId, regId);
          }
          regId = locReg.get(localId) || regId;
        }
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
        // mig. 13: já normalizados no cliente ('M'/'F' e 1/0); defensivo aqui
        const sexo = l.sexo === "M" || l.sexo === "F" ? l.sexo : null;
        const pcd = l.pcd === 1 || l.pcd === 0 ? l.pcd : null;

        const cur = cpfNovo ? exMap.get(cpfNovo) : null; // identidade é o CPF
        if (cur) {
          // CHAPA pode ter mudado no DP — atualiza, exceto se a chapa nova já
          // pertence a OUTRO CPF (colisão de UNIQUE: mantém a atual e registra)
          const dono = l.matricula ? chapaDono.get(l.matricula) : null;
          let chapaNova = l.matricula || null;
          if (chapaNova && dono && dono.id !== cur.id) {
            chapaNova = null; // conflito: não troca
            l.motivos = [...(l.motivos || []), `Chapa ${l.matricula} já pertence a outro CPF — chapa atual mantida`];
            l.status = l.status === "ok" ? "alerta" : l.status;
          }
          // "mudou" só quando o arquivo TRAZ um valor e ele difere do atual
          const diff = (novo, atual) => novo !== null && novo !== undefined && novo !== "" && novo !== atual;
          const mudou =
            diff(l.nome, cur.nome) || diff(chapaNova, cur.codigo_dp) ||
            diff(cargoId, cur.cargo_id) || diff(setorId, cur.setor_id) ||
            diff(localId, cur.local_id) || diff(regId, cur.regional_id) || diff(sitId, cur.situacao_id) ||
            cur.ativo !== 1 ||
            diff(nasc, cur.data_nascimento) || diff(adm, cur.data_admissao) ||
            diff(sexo, cur.sexo) || diff(pcd, cur.pcd);
          if (mudou) {
            // tipo_contratacao e CPF NUNCA mudam em registro existente
            await conn.query(
              `UPDATE colaborador SET
                 codigo_dp = COALESCE(?, codigo_dp), nome = COALESCE(?, nome),
                 data_nascimento = COALESCE(?, data_nascimento),
                 data_admissao = COALESCE(?, data_admissao),
                 sexo = COALESCE(?, sexo), pcd = COALESCE(?, pcd),
                 cargo_id = COALESCE(?, cargo_id), setor_id = COALESCE(?, setor_id),
                 local_id = COALESCE(?, local_id), regional_id = COALESCE(?, regional_id),
                 situacao_id = COALESCE(?, situacao_id), ativo = 1
               WHERE id = ?`,
              [chapaNova, l.nome || null, nasc, adm, sexo, pcd, cargoId, setorId, localId, regId, sitId, cur.id]
            );
            await conn.query(
              "UPDATE colaborador_historico SET data_fim = NOW() WHERE colaborador_id = ? AND data_fim IS NULL",
              [cur.id]
            );
            hist.push([randomUUID(), cur.id, cargoId ?? cur.cargo_id, setorId ?? cur.setor_id, localId ?? cur.local_id, sitId ?? cur.situacao_id, "importacao"]);
            atualizados++;
          }
          // a chapa que este registro passa a usar fica reservada para ele
          if (chapaNova) chapaDono.set(chapaNova, { id: cur.id, cpf: cpfNovo });
        } else {
          // NOVO colaborador — se a chapa já pertence a outro CPF, a linha é
          // pulada com erro (inserir colidiria com a UNIQUE da matrícula)
          const dono = l.matricula ? chapaDono.get(l.matricula) : null;
          if (dono) {
            l.status = "erro";
            l.motivos = [...(l.motivos || []), `Chapa ${l.matricula} já pertence a outro CPF — linha não importada`];
          } else {
            const nid = randomUUID();
            novos.push([nid, l.matricula, l.nome, cpfNovo, nasc, adm, sexo, pcd, tipo, cargoId, setorId, localId, regId, sitId, 1]);
            hist.push([randomUUID(), nid, cargoId, setorId, localId, sitId, "importacao"]);
            if (l.matricula) chapaDono.set(l.matricula, { id: nid, cpf: cpfNovo });
            if (cpfNovo) exMap.set(cpfNovo, { id: nid, codigo_dp: l.matricula }); // linha repetida no lote não duplica
            inseridos++;
          }
        }
        itens.push([
          randomUUID(), importacaoId, l.linha, JSON.stringify(l),
          l.status || "ok", (l.motivos || []).join("; ") || null,
        ]);
      }

      if (novos.length) await bulkInsert(conn,
        "INSERT INTO colaborador (id, codigo_dp, nome, cpf, data_nascimento, data_admissao, sexo, pcd, tipo_contratacao, cargo_id, setor_id, local_id, regional_id, situacao_id, ativo) VALUES ?", novos);
      if (hist.length) await bulkInsert(conn,
        "INSERT INTO colaborador_historico (id, colaborador_id, cargo_id, setor_id, local_id, situacao_id, motivo) VALUES ?", hist);
      if (itens.length) await bulkInsert(conn,
        "INSERT INTO importacao_item (id, importacao_id, linha, payload, status, erros) VALUES ?", itens);

      await conn.commit();
      return Response.json({ ok: true, inseridos, atualizados });
    }

    // ---- finalizar: resolve líderes + arquivamento por CPF (poucas queries) ----
    if (acao === "finalizar") {
      // temLider=false (extrato v3, sem coluna de líder): a importação NÃO
      // mexe em nenhum lider_id — a árvore é gerida dentro do portal.
      const { importacaoId, cpfsArquivo = [], liderPares = [], erros = [], temLider = true } = body;
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
      await conn.query("CREATE TEMPORARY TABLE _imp_file (cpf VARCHAR(11) PRIMARY KEY)");
      await conn.query("CREATE TEMPORARY TABLE _imp_lider (m VARCHAR(40), l VARCHAR(40), KEY(m), KEY(l))");

      if (cpfsArquivo.length)
        await bulkInsert(conn, "INSERT IGNORE INTO _imp_file (cpf) VALUES ?",
          cpfsArquivo.map((c) => [String(c).replace(/\D/g, "")]).filter((c) => c[0]));
      if (liderPares.length)
        await bulkInsert(conn, "INSERT INTO _imp_lider (m, l) VALUES ?", liderPares);

      if (temLider) {
        // define o líder de quem tem par válido (pares por matrícula — v2)
        await conn.query(
          `UPDATE colaborador c
             JOIN _imp_lider t ON t.m = c.codigo_dp
             JOIN colaborador l ON l.codigo_dp = t.l
              SET c.lider_id = l.id`
        );
        // quem veio no arquivo mas sem par válido → sem líder (raiz)
        await conn.query(
          `UPDATE colaborador c
             JOIN _imp_file f ON f.cpf = c.cpf
             LEFT JOIN _imp_lider t ON t.m = c.codigo_dp
              SET c.lider_id = NULL
            WHERE t.m IS NULL`
        );
      }
      // arquivamento POR CPF: CLT ativo cujo CPF não veio no arquivo (inclui
      // quem está sem CPF no banco — invisível para o extrato do DP).
      // PJ NUNCA é arquivado por importação (gestão exclusiva pelo menu PJ).
      const [arq] = await conn.query(
        `UPDATE colaborador c
           LEFT JOIN _imp_file f ON f.cpf = c.cpf
            SET c.ativo = 0
          WHERE c.ativo = 1 AND f.cpf IS NULL
            AND c.tipo_contratacao = 'CLT'`
      );
      // colapso de duplicatas: se o MESMO CPF tem mais de um registro CLT
      // ativo (recontratação com chapa nova), fica só o vínculo de admissão
      // mais recente — o mesmo desempate do login. Os demais são arquivados.
      const [dup] = await conn.query(
        `UPDATE colaborador c
           JOIN colaborador d
             ON d.cpf = c.cpf AND d.id <> c.id
            AND d.ativo = 1 AND d.tipo_contratacao = 'CLT'
            AND (d.data_admissao > c.data_admissao
                 OR (d.data_admissao <=> c.data_admissao AND d.criado_em > c.criado_em))
            SET c.ativo = 0
          WHERE c.ativo = 1 AND c.tipo_contratacao = 'CLT' AND c.cpf IS NOT NULL`
      );
      // invariante: registro arquivado não mantém histórico em aberto
      await conn.query(
        `UPDATE colaborador_historico h
           JOIN colaborador c ON c.id = h.colaborador_id
            SET h.data_fim = NOW()
          WHERE h.data_fim IS NULL AND c.ativo = 0`
      );

      await conn.query("DROP TEMPORARY TABLE IF EXISTS _imp_file");
      await conn.query("DROP TEMPORARY TABLE IF EXISTS _imp_lider");
      await conn.query("UPDATE importacao SET status = 'confirmado' WHERE id = ?", [importacaoId]);
      await conn.commit();

      return Response.json({
        ok: true,
        arquivados: (arq.affectedRows || 0) + (dup.affectedRows || 0),
      });
    }

    return Response.json({ ok: false, erro: "Ação desconhecida." }, { status: 400 });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch {} }
    return erroResposta(e);
  } finally {
    if (conn) conn.release();
  }
}
