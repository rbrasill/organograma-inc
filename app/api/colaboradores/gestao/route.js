// Edição administrativa de colaboradores (tela "Editar colaboradores").
// Aplica as alterações DIRETO no banco, sem passar pelo fluxo de solicitação
// e SEM manter histórico (decisão do produto para esta tela).
//   GET (sem params) → { areas, listas } para montar filtros e selects
//   GET ?setor=<id>&q=<termo> → { colaboradores } (lista para localizar)
//   GET ?id=<uuid>            → { colaborador } com todos os campos e ids
//   POST { id, campos }          → atualiza o colaborador e devolve o registro novo
//   POST { acao:"desativar", id} → arquiva (ativo=0) e reaponta subordinados
//   POST { acao:"reativar",  id} → volta ativo=1

import { randomUUID } from "crypto";
import { getPool } from "@/lib/db";
import { normalizar } from "@/data/ti";
import { exigirNivel } from "@/lib/permissoes";
import { NIVEL } from "@/lib/perfis";

export const dynamic = "force-dynamic";

function erroResposta(e) {
  const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
  return Response.json({ ok: false, erro: msg }, { status: 500 });
}

// nº de subordinados diretos ativos (para avisar ao desativar um líder)
async function contarSubordinados(conn, id) {
  const [[r]] = await conn.query(
    "SELECT COUNT(*) n FROM colaborador WHERE lider_id = ? AND ativo = 1", [id]
  );
  return Number(r.n);
}

// registro completo do colaborador (campos + ids das FKs + nomes resolvidos)
async function carregarColaborador(pool, id) {
  const [rows] = await pool.query(
    `SELECT c.id, c.codigo_dp, c.nome, c.email, c.tipo_contratacao, c.ativo,
            c.cpf, c.telefone,
            DATE_FORMAT(c.data_nascimento, '%Y-%m-%d') AS data_nascimento,
            DATE_FORMAT(c.data_admissao, '%Y-%m-%d')   AS data_admissao,
            c.cargo_id, c.setor_id, c.local_id, c.regional_id, c.situacao_id, c.lider_id,
            c.nivel_id AS nivel_pessoal_id, cg.nivel_id AS cargo_nivel_id,
            cg.nome AS cargo, s.nome AS setor, lt.nome AS local,
            reg.nome AS regional, sit.nome AS situacao,
            ld.codigo_dp AS lider_mat, ld.nome AS lider_nome
       FROM colaborador c
       LEFT JOIN cargo cg          ON cg.id = c.cargo_id
       LEFT JOIN setor s           ON s.id = c.setor_id
       LEFT JOIN local_trabalho lt ON lt.id = c.local_id
       LEFT JOIN regional reg      ON reg.id = c.regional_id
       LEFT JOIN situacao sit      ON sit.id = c.situacao_id
       LEFT JOIN colaborador ld    ON ld.id = c.lider_id
      WHERE c.id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

// resolve líder (por matrícula) e variação de nível (dentro do nível do cargo),
// compartilhado por salvar e criar. Retorna { liderId, nivelPessoal } ou { erro }.
async function resolverEstruturais(pool, campos, idAtual, nivelAtual) {
  let liderId = null;
  if (campos.liderMatricula) {
    const [[l]] = await pool.query("SELECT id FROM colaborador WHERE codigo_dp = ?", [campos.liderMatricula]);
    if (!l) return { erro: `Líder de matrícula "${campos.liderMatricula}" não encontrado.` };
    if (idAtual && l.id === idAtual) return { erro: "O colaborador não pode ser o próprio líder." };
    liderId = l.id;
  }
  let nivelPessoal = nivelAtual || null; // ausente = preserva
  if (Object.prototype.hasOwnProperty.call(campos, "nivelId")) {
    const nivelId = campos.nivelId || null;
    let padraoCargo = null;
    if (campos.cargoId) {
      const [[cg]] = await pool.query(
        `SELECT cg.nivel_id, nh.ordem FROM cargo cg
           LEFT JOIN nivel_hierarquico nh ON nh.id = cg.nivel_id WHERE cg.id = ?`, [campos.cargoId]
      );
      padraoCargo = cg || null;
    }
    if (nivelId) {
      const [[n]] = await pool.query("SELECT id, ordem, cod_var FROM nivel_hierarquico WHERE id = ?", [nivelId]);
      if (!n) return { erro: "Nível hierárquico selecionado não existe." };
      if (padraoCargo?.ordem != null && n.ordem !== padraoCargo.ordem) {
        return { erro: `A variação ${n.cod_var || ""} é do nível ${n.ordem}, mas o cargo é do nível ${padraoCargo.ordem}. Escolha uma variação do mesmo nível — o número do nível se edita no catálogo de cargos.` };
      }
    }
    nivelPessoal = nivelId && nivelId !== (padraoCargo?.nivel_id || null) ? nivelId : null;
  }
  return { liderId, nivelPessoal };
}

// data vinda do formulário (input type=date): ISO válido ou null — nunca lixo
const dataOuNull = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim()) ? String(v).trim() : null);

// próxima matrícula PJ disponível (PJ#### incremental)
async function proximaMatriculaPJ(pool) {
  const [rows] = await pool.query(
    "SELECT codigo_dp FROM colaborador WHERE codigo_dp REGEXP '^PJ[0-9]+$'"
  );
  let max = 1000;
  for (const r of rows) {
    const n = parseInt(String(r.codigo_dp).slice(2), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `PJ${max + 1}`;
}

export async function GET(req) {
  const bloqueio = exigirNivel(NIVEL.ADMIN);
  if (bloqueio) return bloqueio;
  try {
    const pool = getPool();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const setor = url.searchParams.get("setor");
    const q = (url.searchParams.get("q") || "").trim();
    const tipo = url.searchParams.get("tipo"); // 'PJ' → tela dedicada de PJ

    // detalhe de um colaborador
    if (id) {
      const c = await carregarColaborador(pool, id);
      if (!c) return Response.json({ ok: false, erro: "Colaborador não encontrado." }, { status: 404 });
      c.subordinados = await contarSubordinados(pool, id);
      return Response.json({ ok: true, colaborador: c });
    }

    // busca. Sem filtro nenhum não lista tudo (base grande): exige área, termo
    // OU tipo (a tela de PJ lista todos os PJ direto). Por padrão só ativos;
    // incluirInativos=1 traz também os arquivados (para reativar).
    if (setor || q || tipo) {
      const incluirInativos = url.searchParams.get("incluirInativos") === "1";
      const cond = [];
      const args = [];
      if (!incluirInativos) cond.push("c.ativo = 1");
      if (tipo) { cond.push("c.tipo_contratacao = ?"); args.push(tipo); }
      if (setor) { cond.push("c.setor_id = ?"); args.push(setor); }
      if (q) {
        cond.push("c.nome LIKE ? COLLATE utf8mb4_unicode_ci");
        args.push(`%${q}%`);
      }
      const [rows] = await pool.query(
        `SELECT c.id, c.codigo_dp AS matricula, c.nome, c.ativo,
                cg.nome AS cargo, s.nome AS setor
           FROM colaborador c
           LEFT JOIN cargo cg ON cg.id = c.cargo_id
           LEFT JOIN setor s  ON s.id = c.setor_id
          WHERE ${cond.join(" AND ")}
          ORDER BY c.ativo DESC, c.nome
          LIMIT 500`,
        args
      );
      return Response.json({ ok: true, colaboradores: rows });
    }

    // bootstrap: áreas (com contagem) + listas para os selects
    const [areas] = await pool.query(
      `SELECT s.id, s.nome, COUNT(c.id) AS pessoas
         FROM setor s
         LEFT JOIN colaborador c ON c.setor_id = s.id AND c.ativo = 1
        GROUP BY s.id, s.nome
        ORDER BY s.nome`
    );
    const [cargos]     = await pool.query("SELECT id, nome, nivel_id AS nivelId FROM cargo ORDER BY nome");
    const [setores]    = await pool.query("SELECT id, nome FROM setor ORDER BY nome");
    const [locais]     = await pool.query("SELECT id, nome FROM local_trabalho ORDER BY nome");
    const [regionais]  = await pool.query("SELECT id, nome FROM regional ORDER BY nome");
    const [situacoes]  = await pool.query("SELECT id, nome FROM situacao ORDER BY nome");
    const [niveis]     = await pool.query(
      "SELECT id, codigo_nh AS codigo, ordem, variacao, cod_var AS codVar, familia FROM nivel_hierarquico ORDER BY ordem, variacao"
    );

    return Response.json({
      ok: true,
      areas: areas.map((a) => ({ id: a.id, nome: a.nome, pessoas: Number(a.pessoas) })),
      listas: { cargos, setores, locais, regionais, situacoes, niveis },
    });
  } catch (e) {
    return erroResposta(e);
  }
}

export async function POST(req) {
  const bloqueio = exigirNivel(NIVEL.ADMIN);
  if (bloqueio) return bloqueio;
  let conn;
  try {
    const pool = getPool();
    const body = await req.json();
    const { id, acao } = body;

    // ---- criar: novo colaborador (usado pela tela de PJ). Matrícula PJ é
    // gerada automaticamente; tipo forçado conforme campos.tipo (default PJ).
    if (acao === "criar") {
      const campos = body.campos || {};
      const nome = (campos.nome || "").trim();
      if (!nome) return erro400("Informe o nome do colaborador.");
      const tipo = normalizar(campos.tipo || "PJ").includes("clt") ? "CLT" : "PJ";

      const vinc = await resolverEstruturais(pool, campos, null, null);
      if (vinc.erro) return erro400(vinc.erro);

      let codigo = (campos.codigo || "").trim();
      if (!codigo) codigo = tipo === "PJ" ? await proximaMatriculaPJ(pool) : null;
      if (codigo) {
        const [[dup]] = await pool.query("SELECT id FROM colaborador WHERE codigo_dp = ?", [codigo]);
        if (dup) return erro400(`A matrícula ${codigo} já existe.`);
      }

      const novoId = randomUUID();
      const fk = (v) => (v ? v : null);
      await pool.query(
        `INSERT INTO colaborador
           (id, codigo_dp, nome, email, tipo_contratacao, cpf, telefone,
            data_nascimento, data_admissao,
            cargo_id, nivel_id, setor_id, local_id, regional_id, situacao_id, lider_id, ativo)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
        [
          novoId, codigo, nome, (campos.email || "").trim() || null, tipo,
          String(campos.cpf || "").replace(/\D/g, "") || null, (campos.telefone || "").trim() || null,
          dataOuNull(campos.dataNascimento), dataOuNull(campos.dataAdmissao),
          fk(campos.cargoId), vinc.nivelPessoal, fk(campos.setorId), fk(campos.localId),
          fk(campos.regionalId), fk(campos.situacaoId), vinc.liderId,
        ]
      );
      await pool.query(
        "INSERT INTO colaborador_historico (id, colaborador_id, cargo_id, setor_id, local_id, situacao_id, lider_id, motivo) VALUES (?,?,?,?,?,?,?,'cadastro_manual')",
        [randomUUID(), novoId, fk(campos.cargoId), fk(campos.setorId), fk(campos.localId), fk(campos.situacaoId), vinc.liderId]
      );
      const criado = await carregarColaborador(pool, novoId);
      return Response.json({ ok: true, colaborador: criado });
    }

    if (!id) return Response.json({ ok: false, erro: "Colaborador não informado." }, { status: 400 });

    // ---- excluir: remoção PERMANENTE com integridade (subordinados sobem
    // para o líder do excluído; registros ligados a ele são limpos). Irreversível.
    if (acao === "excluir") {
      conn = await pool.getConnection();
      await conn.beginTransaction();
      const [[c]] = await conn.query("SELECT id, lider_id FROM colaborador WHERE id = ? FOR UPDATE", [id]);
      if (!c) { await conn.rollback(); return Response.json({ ok: false, erro: "Colaborador não encontrado." }, { status: 404 }); }

      // subordinados (ativos ou não) passam ao líder de cima do excluído
      const [sub] = await conn.query("UPDATE colaborador SET lider_id = ? WHERE lider_id = ?", [c.lider_id || null, id]);
      // desfaz referências que apontam para ele antes de apagar
      await conn.query("DELETE FROM colaborador_historico WHERE colaborador_id = ?", [id]);
      await conn.query("UPDATE colaborador_historico SET lider_id = NULL WHERE lider_id = ?", [id]);
      await conn.query("DELETE FROM solicitacao_ajuste WHERE colaborador_alvo_id = ?", [id]);
      await conn.query("UPDATE solicitacao_ajuste SET solicitante_id = NULL WHERE solicitante_id = ?", [id]);
      await conn.query("UPDATE solicitacao_ajuste SET aprovador_id = NULL WHERE aprovador_id = ?", [id]);
      await conn.query("DELETE FROM log_auditoria WHERE entidade = 'colaborador' AND registro_id = ?", [id]);
      await conn.query("UPDATE log_auditoria SET autor_id = NULL WHERE autor_id = ?", [id]);
      await conn.query("DELETE FROM usuario_perfil WHERE colaborador_id = ?", [id]);
      await conn.query("DELETE FROM colaborador WHERE id = ?", [id]);
      await conn.commit();
      return Response.json({ ok: true, reapontados: sub.affectedRows || 0 });
    }

    // ---- desativar: arquiva (ativo=0) e reaponta os subordinados diretos
    // para o líder do desativado (mantém a árvore conectada). Nada é apagado.
    if (acao === "desativar") {
      conn = await pool.getConnection();
      await conn.beginTransaction();
      const [[c]] = await conn.query(
        "SELECT id, nome, lider_id, ativo FROM colaborador WHERE id = ? FOR UPDATE", [id]
      );
      if (!c) { await conn.rollback(); return Response.json({ ok: false, erro: "Colaborador não encontrado." }, { status: 404 }); }
      if (!c.ativo) { await conn.rollback(); return Response.json({ ok: false, erro: "Este colaborador já está desativado." }, { status: 409 }); }

      // subordinados sobem para o líder de cima (pode ser NULL = viram raiz)
      const [sub] = await conn.query(
        "UPDATE colaborador SET lider_id = ? WHERE lider_id = ? AND ativo = 1 AND id <> ?",
        [c.lider_id || null, id, id]
      );
      // arquiva o colaborador
      await conn.query("UPDATE colaborador SET ativo = 0, lider_id = NULL WHERE id = ?", [id]);
      // fecha o vínculo vigente no histórico + auditoria
      await conn.query("UPDATE colaborador_historico SET data_fim = NOW() WHERE colaborador_id = ? AND data_fim IS NULL", [id]);
      await conn.query(
        "INSERT INTO log_auditoria (id, entidade, registro_id, campo, valor_antigo, valor_novo) VALUES (?, 'colaborador', ?, 'ativo', '1', '0')",
        [randomUUID(), id]
      );
      await conn.commit();
      return Response.json({ ok: true, reapontados: sub.affectedRows || 0 });
    }

    // ---- reativar: volta ativo=1 (entra sem líder — reatribuir depois) ----
    if (acao === "reativar") {
      const [[c]] = await pool.query("SELECT id, ativo FROM colaborador WHERE id = ?", [id]);
      if (!c) return Response.json({ ok: false, erro: "Colaborador não encontrado." }, { status: 404 });
      if (c.ativo) return Response.json({ ok: false, erro: "Este colaborador já está ativo." }, { status: 409 });
      await pool.query("UPDATE colaborador SET ativo = 1 WHERE id = ?", [id]);
      await pool.query(
        "INSERT INTO log_auditoria (id, entidade, registro_id, campo, valor_antigo, valor_novo) VALUES (?, 'colaborador', ?, 'ativo', '0', '1')",
        [randomUUID(), id]
      );
      return Response.json({ ok: true });
    }

    // ---- salvar (edição de campos) ----
    const { campos } = body;
    if (!campos) return Response.json({ ok: false, erro: "Dados incompletos." }, { status: 400 });

    const [[alvo]] = await pool.query("SELECT id, nivel_id, ativo FROM colaborador WHERE id = ?", [id]);
    if (!alvo) return Response.json({ ok: false, erro: "Colaborador não encontrado." }, { status: 404 });
    if (!alvo.ativo) {
      return Response.json({
        ok: false,
        erro: "Colaborador desativado é somente visualização — reative-o para poder editar.",
      }, { status: 409 });
    }

    const nome = (campos.nome || "").trim();
    if (!nome) return Response.json({ ok: false, erro: "O nome não pode ficar em branco." }, { status: 400 });

    const tipo = normalizar(campos.tipo || "").includes("pj") ? "PJ" : "CLT";
    const fk = (v) => (v ? v : null);

    // líder + variação de nível (compartilhado com criar)
    const vinc = await resolverEstruturais(pool, campos, id, alvo.nivel_id);
    if (vinc.erro) return erro400(vinc.erro);

    // cpf/telefone: só entram no UPDATE quando o payload traz o campo.
    // A tela geral de edição não os envia (CPF lá é somente visualização) —
    // sem isso, salvar por ela apagaria o CPF/telefone já gravados.
    const tem = (c) => Object.prototype.hasOwnProperty.call(campos, c);
    const extraSet = [];
    const extraVal = [];
    if (tem("cpf")) { extraSet.push("cpf = ?"); extraVal.push(String(campos.cpf || "").replace(/\D/g, "") || null); }
    if (tem("telefone")) { extraSet.push("telefone = ?"); extraVal.push((campos.telefone || "").trim() || null); }
    if (tem("dataNascimento")) { extraSet.push("data_nascimento = ?"); extraVal.push(dataOuNull(campos.dataNascimento)); }
    if (tem("dataAdmissao")) { extraSet.push("data_admissao = ?"); extraVal.push(dataOuNull(campos.dataAdmissao)); }

    await pool.query(
      `UPDATE colaborador
          SET nome = ?, email = ?, tipo_contratacao = ?,
              ${extraSet.length ? `${extraSet.join(", ")},` : ""}
              cargo_id = ?, nivel_id = ?, setor_id = ?, local_id = ?, regional_id = ?, situacao_id = ?,
              lider_id = ?
        WHERE id = ?`,
      [
        nome, (campos.email || "").trim() || null, tipo,
        ...extraVal,
        fk(campos.cargoId), vinc.nivelPessoal, fk(campos.setorId), fk(campos.localId),
        fk(campos.regionalId), fk(campos.situacaoId), vinc.liderId, id,
      ]
    );

    const atualizado = await carregarColaborador(pool, id);
    return Response.json({ ok: true, colaborador: atualizado });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch {} }
    return erroResposta(e);
  } finally {
    if (conn) conn.release();
  }
}
