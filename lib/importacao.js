// Lógica compartilhada da importação por Excel (cliente e servidor).
// Regras conforme CLAUDE.md seção 7: upsert por matrícula, normalização,
// validação com prévia. Linhas com ERRO são puladas; ALERTAS entram e ficam
// visíveis como inconsistência no portal.

import { normalizar } from "@/data/ti";

// O extrato novo do DP traz o LOCAL com o código embutido no início do texto:
// "472 - Reserva JK" (e variações sem espaço, "127- Unique Benfica") — o
// número do prefixo é o código oficial da obra no DP, e desde a migração 06
// é exatamente o codigo_dp do catálogo de locais (sem prefixo LOCTRA).
// Extrai { codigo, nome } ou null quando o texto não segue o formato.
export function localComCodigo(texto) {
  const m = /^(\d{1,6})\s*-\s*(.+)$/.exec(String(texto || "").trim());
  if (!m) return null;
  return { codigo: m[1], nome: m[2].trim() };
}

// compatibilidade com arquivos antigos (v2), cujo código vinha como LOCTRA…:
// a série interna morreu na migração 06 — sobra o número, que casa por nome
// quando não corresponder a um código do DP.
export function normalizarCodigoLocal(v) {
  return String(v || "").trim().replace(/^LOCTRA/i, "");
}

// mapeia os cabeçalhos da planilha oficial v2 (18 colunas) para os campos
// internos. Casa por conteúdo normalizado, tolerando variações de grafia.
// Cuidado: a v2 tem colunas de CÓDIGO ("Codigo Setor", "Cod. Local...",
// "Codigo Situação Colaborador") que contêm as mesmas palavras dos nomes —
// por isso os códigos são testados ANTES dos nomes, e a matrícula exclui
// explicitamente "situação".
function identificarColunas(cabecalhos) {
  const idx = {};
  cabecalhos.forEach((h, i) => {
    const n = normalizar(String(h || ""));
    if (!n) return;
    const cod = n.includes("cod"); // "cod" ou "codigo"

    // matrícula do colaborador (tem "cod"+"colaborador", mas NÃO é a situação)
    if (cod && n.includes("colaborador") && !n.includes("situa")) idx.matricula = i;
    else if (n.includes("cpf")) idx.cpf = i;                                      // opcional ("CPF"/"CPF Colaborador")
    else if (n.includes("nome") && n.includes("colaborador")) idx.nome = i;
    else if (n.includes("nome") && n.includes("lider")) idx.nomeLider = i;        // ignorado (derivado)
    else if (n.includes("matricula") && n.includes("lider")) idx.matriculaLider = i;
    else if (n.includes("tipo") && n.includes("contrata")) idx.tipo = i;          // v2: CLT/PJ explícito
    else if (n.includes("nivel") && n.includes("hierarquia")) idx.codigoNH = i;   // v2: NH… (define o nível)
    else if (n.includes("nivel")) return;                                         // demais colunas de nível: ignoradas
    else if (cod && n.includes("setor")) idx.codigoSetor = i;                     // v2: SET…
    else if (cod && n.includes("cargo")) idx.codigoCargo = i;
    else if (cod && n.includes("situa")) idx.codigoSituacao = i;                  // v2: letra
    else if (cod && n.includes("local")) idx.codigoLocal = i;                     // v2: LOCTRA…
    else if (n.includes("setor")) idx.setor = i;
    else if (n.includes("cargo")) idx.cargo = i;
    else if (n.includes("situa")) idx.situacao = i;
    else if (n.includes("local")) idx.local = i;
    else if (n.includes("regional")) idx.regional = i;
  });
  return idx;
}

const OBRIGATORIAS = ["matricula", "nome"];

// converte a matriz da planilha (linha 0 = cabeçalho) em linhas estruturadas
export function extrairLinhas(matriz) {
  if (!matriz || matriz.length < 2) {
    return { erro: "Planilha vazia ou sem linhas de dados.", linhas: [], colunas: {} };
  }
  const colunas = identificarColunas(matriz[0]);
  const faltando = OBRIGATORIAS.filter((c) => colunas[c] === undefined);
  if (faltando.length) {
    return {
      erro: `Não encontrei as colunas obrigatórias: ${faltando.join(", ")}. Confira se o arquivo segue o modelo oficial.`,
      linhas: [], colunas,
    };
  }
  const cel = (row, c) => (colunas[c] === undefined ? "" : String(row[colunas[c]] ?? "").trim());
  const linhas = [];
  for (let r = 1; r < matriz.length; r++) {
    const row = matriz[r];
    if (!row || row.every((v) => String(v ?? "").trim() === "")) continue; // pula linhas em branco
    // local no formato novo ("472 - Reserva JK"): deriva o código do DP do
    // prefixo quando o arquivo não traz a coluna de código separada
    const localTxt = cel(row, "local");
    const codLocalCol = normalizarCodigoLocal(cel(row, "codigoLocal"));
    const locParse = codLocalCol ? null : localComCodigo(localTxt);
    linhas.push({
      linha: r + 1, // número da linha no Excel (1-based, contando o cabeçalho)
      matricula: cel(row, "matricula"),
      nome: cel(row, "nome"),
      cpf: cel(row, "cpf"), // opcional — vazio não bloqueia a linha
      tipo: cel(row, "tipo"),               // v2: CLT/PJ (explícito)
      cargo: cel(row, "cargo"),
      codigoCargo: cel(row, "codigoCargo"),
      codigoNH: cel(row, "codigoNH"),       // v2: NH… (nível do cargo)
      setor: cel(row, "setor"),
      codigoSetor: cel(row, "codigoSetor"), // v2: SET…
      local: localTxt,
      codigoLocal: codLocalCol || (locParse ? locParse.codigo : ""), // número do DP (v2 LOCTRA… é normalizado)
      regional: cel(row, "regional"),
      situacao: cel(row, "situacao"),
      codigoSituacao: cel(row, "codigoSituacao"), // v2: letra
      matriculaLider: cel(row, "matriculaLider"),
    });
  }
  return { erro: null, linhas, colunas };
}

// valida as linhas extraídas. Retorna linhas anotadas (status ok/alerta/erro
// + mensagens + liderValido) e um resumo.
//   matriculasBanco: Set de codigo_dp já existentes (para novos x atualizados)
//   situacoesValidas: Set de nomes normalizados aceitos (lista fechada do banco)
//   situacoesCodigos: Set de códigos-letra aceitos (v2) — casa por código OU nome
export function validarLinhas(linhas, { matriculasBanco = new Set(), situacoesValidas = null, situacoesCodigos = null } = {}) {
  const vistas = new Set();
  const noArquivo = new Set(linhas.map((l) => l.matricula).filter(Boolean));
  const liderDe = {}; // matricula -> matricula do líder (para checar ciclos)
  linhas.forEach((l) => { if (l.matricula) liderDe[l.matricula] = l.matriculaLider; });

  // membros de ciclo REAL (A→B→…→A). Auto-líder é raiz (não ciclo). Apenas os
  // MEMBROS são marcados — os subordinados abaixo do ciclo mantêm seus líderes.
  // Cada membro terá o líder anulado na importação (vira raiz), quebrando o
  // ciclo e mantendo a árvore válida.
  const emCiclo = new Set();
  {
    const estado = {}; // undefined | 'proc' | 'ok'
    for (const start of Object.keys(liderDe)) {
      if (estado[start]) continue;
      const caminho = [], pos = new Map();
      let x = start;
      while (x && estado[x] === undefined) {
        if (liderDe[x] === x) { estado[x] = "ok"; x = null; break; } // auto-líder = raiz
        estado[x] = "proc"; pos.set(x, caminho.length); caminho.push(x);
        x = liderDe[x];
      }
      if (x && estado[x] === "proc") {
        for (let i = pos.get(x); i < caminho.length; i++) emCiclo.add(caminho[i]);
      }
      for (const n of caminho) estado[n] = "ok";
    }
  }

  const anotadas = linhas.map((l) => {
    const erros = [];
    const alertas = [];

    if (!l.matricula) erros.push("Matrícula vazia");
    else if (vistas.has(l.matricula)) erros.push(`Matrícula duplicada no arquivo (${l.matricula})`);
    else vistas.add(l.matricula);

    if (!l.nome) erros.push("Nome vazio");

    // situação válida se o código-letra OU o nome normalizado existir no banco
    const sitPorCodigo = l.codigoSituacao && situacoesCodigos && situacoesCodigos.has(l.codigoSituacao.toLowerCase());
    const sitPorNome = l.situacao && situacoesValidas && situacoesValidas.has(normalizar(l.situacao));
    if (!l.situacao && !l.codigoSituacao) alertas.push("Situação não informada");
    else if ((situacoesValidas || situacoesCodigos) && !sitPorCodigo && !sitPorNome)
      erros.push(`Situação "${l.situacao || l.codigoSituacao}" fora da lista válida`);

    if (!l.cargo) alertas.push("Cargo não informado");
    if (!l.setor) alertas.push("Setor não informado");

    let liderValido = l.matriculaLider || null;
    if (l.matriculaLider) {
      if (l.matriculaLider === l.matricula) {
        alertas.push("Colaborador é o próprio líder — entrará sem líder");
        liderValido = null;
      } else if (!noArquivo.has(l.matriculaLider) && !matriculasBanco.has(l.matriculaLider)) {
        alertas.push(`Líder "${l.matriculaLider}" não encontrado — entrará sem líder`);
        liderValido = null;
      } else if (emCiclo.has(l.matricula)) {
        // membro de um ciclo: entra sem líder (raiz) para não quebrar a árvore
        alertas.push("Ciclo de liderança detectado — entrará sem líder (corrigir na origem)");
        liderValido = null;
      }
    } else {
      alertas.push("Sem líder (raiz do organograma)");
    }

    // tipo de contratação: coluna explícita da v2; fallback = prefixo "PJ"
    const tipo = l.tipo
      ? (normalizar(l.tipo).includes("pj") ? "PJ" : "CLT")
      : (String(l.matricula).toUpperCase().startsWith("PJ") ? "PJ" : "CLT");
    const existente = matriculasBanco.has(l.matricula);
    const status = erros.length ? "erro" : alertas.length ? "alerta" : "ok";
    return { ...l, tipo, existente, liderValido, status, erros, alertas };
  });

  const validas = anotadas.filter((l) => l.status !== "erro");
  const resumo = {
    total: anotadas.length,
    ok: anotadas.filter((l) => l.status === "ok").length,
    alertas: anotadas.filter((l) => l.status === "alerta").length,
    erros: anotadas.filter((l) => l.status === "erro").length,
    novos: validas.filter((l) => !l.existente).length,
    atualizados: validas.filter((l) => l.existente).length,
  };
  return { anotadas, resumo };
}
