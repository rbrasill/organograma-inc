// Catálogos da base (dados que NÃO são de colaboradores): áreas, cargos,
// níveis hierárquicos, locais, regionais e situações — edição administrativa.
//
// Integridade (regras desta rota):
//  * nome sempre re-normalizado (nome_normalizado) — mantém a importação
//    casando os registros e impede duplicatas por grafia;
//  * códigos NÃO são editáveis pelo usuário: ao criar, o sistema gera o
//    PRÓXIMO da sequência oficial já usada no banco (SET…, LOCTRA…, NH…,
//    número de cargo, próxima letra livre de situação); ao salvar, o código
//    existente é preservado;
//  * excluir NUNCA deixa vínculo órfão: dentro de uma transação, todas as
//    referências (colaborador, histórico, cargos, sub-áreas) são desfeitas
//    (viram NULL) antes do DELETE — o colaborador permanece, só perde o
//    vínculo com o registro removido.
//
//   GET  → todas as listas com contagem de vínculos
//   POST { acao:"salvar",  tipo, id, campos }
//   POST { acao:"criar",   tipo, campos }
//   POST { acao:"excluir", tipo, id }

import { randomUUID } from "crypto";
import { getPool } from "@/lib/db";
import { normalizar } from "@/data/ti";

export const dynamic = "force-dynamic";

function erroResposta(e) {
  const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
  return Response.json({ ok: false, erro: msg }, { status: 500 });
}
const erro400 = (m) => Response.json({ ok: false, erro: m }, { status: 400 });

// gera o PRÓXIMO código da sequência oficial de cada catálogo, lendo o maior
// já usado no banco. O usuário não digita código — o sistema segue a série.
//   setor SET300… · local LOCTRA200… · nível NH500… · cargo numérico (1,2,…)
//   situação: próxima LETRA livre de A a Z (série fechada)
async function proximoCodigo(pool, tipo) {
  const seq = {
    setor: { tabela: "setor", col: "codigo_dp", prefixo: "SET" },
    local: { tabela: "local_trabalho", col: "codigo_dp", prefixo: "LOCTRA" },
    nivel: { tabela: "nivel_hierarquico", col: "codigo_nh", prefixo: "NH" },
    cargo: { tabela: "cargo", col: "codigo_cargo_dp", prefixo: "" },
  }[tipo];

  if (tipo === "situacao") {
    const [rows] = await pool.query("SELECT codigo_dp FROM situacao WHERE codigo_dp REGEXP '^[A-Z]$'");
    const usadas = new Set(rows.map((r) => r.codigo_dp));
    for (const l of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") if (!usadas.has(l)) return l;
    return null; // todas as 26 letras em uso
  }
  if (!seq) return null; // regional não tem código

  const [[r]] = await pool.query(
    `SELECT MAX(CAST(SUBSTRING(${seq.col}, ?) AS UNSIGNED)) AS maior
       FROM ${seq.tabela} WHERE ${seq.col} REGEXP ?`,
    [seq.prefixo.length + 1, `^${seq.prefixo}[0-9]+$`]
  );
  const maior = Number(r.maior) || 0;
  return `${seq.prefixo}${maior + 1}`;
}

// definição de cada catálogo: tabela, coluna de código e como desvincular
const DEFS = {
  setor: {
    tabela: "setor", colCodigo: "codigo_dp", temNome: true, codigoUnico: true,
    desvincular: [
      "UPDATE colaborador SET setor_id = NULL WHERE setor_id = ?",
      "UPDATE colaborador_historico SET setor_id = NULL WHERE setor_id = ?",
      "UPDATE setor SET setor_pai_id = NULL WHERE setor_pai_id = ?",
    ],
  },
  cargo: {
    tabela: "cargo", colCodigo: "codigo_cargo_dp", temNome: true, codigoUnico: false,
    desvincular: [
      "UPDATE colaborador SET cargo_id = NULL WHERE cargo_id = ?",
      "UPDATE colaborador_historico SET cargo_id = NULL WHERE cargo_id = ?",
    ],
  },
  nivel: {
    tabela: "nivel_hierarquico", colCodigo: "codigo_nh", temNome: false, codigoUnico: true,
    desvincular: ["UPDATE cargo SET nivel_id = NULL WHERE nivel_id = ?"],
  },
  local: {
    tabela: "local_trabalho", colCodigo: "codigo_dp", temNome: true, codigoUnico: true,
    desvincular: [
      "UPDATE colaborador SET local_id = NULL WHERE local_id = ?",
      "UPDATE colaborador_historico SET local_id = NULL WHERE local_id = ?",
    ],
  },
  regional: {
    tabela: "regional", colCodigo: null, temNome: true, codigoUnico: false,
    desvincular: ["UPDATE colaborador SET regional_id = NULL WHERE regional_id = ?"],
  },
  situacao: {
    tabela: "situacao", colCodigo: "codigo_dp", temNome: true, codigoUnico: true,
    desvincular: [
      "UPDATE colaborador SET situacao_id = NULL WHERE situacao_id = ?",
      "UPDATE colaborador_historico SET situacao_id = NULL WHERE situacao_id = ?",
    ],
  },
};

export async function GET() {
  try {
    const pool = getPool();
    const [setores] = await pool.query(
      `SELECT s.id, s.codigo_dp AS codigo, s.nome, COUNT(c.id) AS usos
         FROM setor s LEFT JOIN colaborador c ON c.setor_id = s.id AND c.ativo = 1
        GROUP BY s.id, s.codigo_dp, s.nome ORDER BY s.nome`
    );
    const [cargos] = await pool.query(
      `SELECT cg.id, cg.codigo_cargo_dp AS codigo, cg.nome, cg.nivel_id AS nivelId, COUNT(c.id) AS usos
         FROM cargo cg LEFT JOIN colaborador c ON c.cargo_id = cg.id AND c.ativo = 1
        GROUP BY cg.id, cg.codigo_cargo_dp, cg.nome, cg.nivel_id ORDER BY cg.nome`
    );
    const [niveis] = await pool.query(
      `SELECT n.id, n.codigo_nh AS codigo, n.ordem, n.variacao, n.cod_var AS codVar, n.familia,
              COUNT(cg.id) AS usos
         FROM nivel_hierarquico n LEFT JOIN cargo cg ON cg.nivel_id = n.id
        GROUP BY n.id, n.codigo_nh, n.ordem, n.variacao, n.cod_var, n.familia
        ORDER BY n.ordem, n.variacao`
    );
    const [locais] = await pool.query(
      `SELECT l.id, l.codigo_dp AS codigo, l.nome, COUNT(c.id) AS usos
         FROM local_trabalho l LEFT JOIN colaborador c ON c.local_id = l.id AND c.ativo = 1
        GROUP BY l.id, l.codigo_dp, l.nome ORDER BY l.nome`
    );
    const [regionais] = await pool.query(
      `SELECT r.id, r.nome, COUNT(c.id) AS usos
         FROM regional r LEFT JOIN colaborador c ON c.regional_id = r.id AND c.ativo = 1
        GROUP BY r.id, r.nome ORDER BY r.nome`
    );
    const [situacoes] = await pool.query(
      `SELECT s.id, s.codigo_dp AS codigo, s.nome, s.ativo_na_arvore AS ativoArvore, COUNT(c.id) AS usos
         FROM situacao s LEFT JOIN colaborador c ON c.situacao_id = s.id AND c.ativo = 1
        GROUP BY s.id, s.codigo_dp, s.nome, s.ativo_na_arvore ORDER BY s.nome`
    );
    const num = (rows) => rows.map((r) => ({ ...r, usos: Number(r.usos) }));
    return Response.json({
      ok: true,
      setores: num(setores), cargos: num(cargos), niveis: num(niveis),
      locais: num(locais), regionais: num(regionais), situacoes: num(situacoes),
    });
  } catch (e) {
    return erroResposta(e);
  }
}

// valida e normaliza os campos de um tipo. Retorna { erro } ou { valores }
async function validar(pool, tipo, campos, idAtual) {
  const def = DEFS[tipo];
  const v = {};

  if (def.temNome) {
    const nome = (campos.nome || "").trim();
    if (!nome) return { erro: "O nome não pode ficar em branco." };
    const norm = normalizar(nome);
    const [dup] = await pool.query(
      `SELECT id, nome FROM ${def.tabela} WHERE nome_normalizado = ? AND id <> ?`,
      [norm, idAtual || ""]
    );
    if (dup.length) {
      const dica = tipo === "setor" ? ' Para unir duas áreas, use "Gerenciar áreas → Mesclar".' : "";
      return { erro: `Já existe "${dup[0].nome}" com esse nome.${dica}` };
    }
    v.nome = nome; v.norm = norm;
  }

  // código: NUNCA vem do usuário — gerado pela sequência ao criar e
  // preservado ao salvar (ver proximoCodigo / POST).

  if (tipo === "nivel") {
    const ordem = parseInt(campos.ordem, 10);
    if (!Number.isInteger(ordem) || ordem < 1 || ordem > 18) {
      return { erro: "Ordem deve ser um número inteiro de 1 (topo) a 18 — o padrão da tabela oficial de níveis." };
    }
    v.ordem = ordem;
    v.variacao = (campos.variacao || "").trim().toUpperCase().slice(0, 4) || null;
    v.codVar = (campos.codVar || "").trim().slice(0, 10) || null;
    v.familia = (campos.familia || "").trim().slice(0, 120) || null;
  }

  if (tipo === "cargo") {
    let nivelId = campos.nivelId || null;
    if (nivelId) {
      const [[n]] = await pool.query("SELECT id FROM nivel_hierarquico WHERE id = ?", [nivelId]);
      if (!n) return { erro: "Nível hierárquico selecionado não existe." };
    }
    v.nivelId = nivelId;
  }

  if (tipo === "situacao") {
    v.ativoArvore = campos.ativoArvore ? 1 : 0;
  }

  return { valores: v };
}

export async function POST(req) {
  let conn;
  try {
    const body = await req.json();
    const pool = getPool();
    const { tipo, id } = body;
    const def = DEFS[tipo];
    if (!def) return erro400("Tipo de catálogo desconhecido.");

    if (body.acao === "salvar" || body.acao === "criar") {
      const criando = body.acao === "criar";
      if (!criando && !id) return erro400("Registro não informado.");
      if (!criando) {
        const [[existe]] = await pool.query(`SELECT id FROM ${def.tabela} WHERE id = ?`, [id]);
        if (!existe) return Response.json({ ok: false, erro: "Registro não encontrado." }, { status: 404 });
      }

      const { erro, valores } = await validar(pool, tipo, body.campos || {}, criando ? null : id);
      if (erro) return erro400(erro);

      const sets = [], vals = [];
      if (def.temNome) { sets.push("nome = ?", "nome_normalizado = ?"); vals.push(valores.nome, valores.norm); }
      if (tipo === "nivel") {
        sets.push("ordem = ?", "variacao = ?", "cod_var = ?", "familia = ?");
        vals.push(valores.ordem, valores.variacao, valores.codVar, valores.familia);
      }
      if (tipo === "cargo") { sets.push("nivel_id = ?"); vals.push(valores.nivelId); }
      if (tipo === "situacao") { sets.push("ativo_na_arvore = ?"); vals.push(valores.ativoArvore); }

      if (criando) {
        const novoId = randomUUID();
        const cols = ["id"], marks = ["?"], ins = [novoId];
        sets.forEach((s, i) => { cols.push(s.split(" = ")[0]); marks.push("?"); ins.push(vals[i]); });
        // código gerado pelo sistema: próximo da sequência oficial do banco
        let codigo = null;
        if (def.colCodigo) {
          codigo = await proximoCodigo(pool, tipo);
          if (tipo === "situacao" && !codigo) {
            return erro400("Todas as 26 letras de situação já estão em uso — exclua uma antes de criar outra.");
          }
          cols.push(def.colCodigo); marks.push("?"); ins.push(codigo);
        }
        await pool.query(`INSERT INTO ${def.tabela} (${cols.join(", ")}) VALUES (${marks.join(", ")})`, ins);
        return Response.json({ ok: true, id: novoId, codigo });
      }
      // salvar: o código NUNCA entra no UPDATE — permanece o da criação
      await pool.query(`UPDATE ${def.tabela} SET ${sets.join(", ")} WHERE id = ?`, [...vals, id]);
      return Response.json({ ok: true });
    }

    if (body.acao === "excluir") {
      if (!id) return erro400("Registro não informado.");
      conn = await pool.getConnection();
      await conn.beginTransaction();
      const [[existe]] = await conn.query(`SELECT id FROM ${def.tabela} WHERE id = ?`, [id]);
      if (!existe) { await conn.rollback(); return Response.json({ ok: false, erro: "Registro não encontrado." }, { status: 404 }); }

      // desfaz TODOS os vínculos antes de excluir (nada fica órfão)
      let desvinculados = 0;
      for (const sql of def.desvincular) {
        const [r] = await conn.query(sql, [id]);
        desvinculados += r.affectedRows || 0;
      }
      await conn.query(`DELETE FROM ${def.tabela} WHERE id = ?`, [id]);
      await conn.commit();
      return Response.json({ ok: true, desvinculados });
    }

    return erro400("Ação desconhecida.");
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch {} }
    return erroResposta(e);
  } finally {
    if (conn) conn.release();
  }
}
