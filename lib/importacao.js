// Lógica compartilhada da importação por Excel (cliente e servidor).
// Regras conforme CLAUDE.md seção 7: upsert por matrícula, normalização,
// validação com prévia. Linhas com ERRO são puladas; ALERTAS entram e ficam
// visíveis como inconsistência no portal.

import { normalizar } from "@/data/ti";

// mapeia os cabeçalhos reais da planilha oficial para os campos internos.
// casa por conteúdo normalizado, tolerando variações de grafia/espaços.
function identificarColunas(cabecalhos) {
  const idx = {};
  cabecalhos.forEach((h, i) => {
    const n = normalizar(String(h || ""));
    if (!n) return;
    if (n.includes("cod") && n.includes("colaborador")) idx.matricula = i;
    else if (n.includes("nome") && n.includes("colaborador")) idx.nome = i;
    else if (n.includes("matricula") && n.includes("lider")) idx.matriculaLider = i;
    else if (n.includes("nome") && n.includes("lider")) idx.nomeLider = i; // ignorado (derivado por join)
    else if (n.includes("nivel")) idx.nivel = i;                           // ignorado (inutilizável)
    else if (n.includes("cod") && n.includes("cargo")) idx.codigoCargo = i;
    else if (n === "cargo" || (n.includes("cargo") && !n.includes("cod"))) idx.cargo = i;
    else if (n.includes("setor")) idx.setor = i;
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
    linhas.push({
      linha: r + 1, // número da linha no Excel (1-based, contando o cabeçalho)
      matricula: cel(row, "matricula"),
      nome: cel(row, "nome"),
      cargo: cel(row, "cargo"),
      codigoCargo: cel(row, "codigoCargo"),
      setor: cel(row, "setor"),
      local: cel(row, "local"),
      regional: cel(row, "regional"),
      situacao: cel(row, "situacao"),
      matriculaLider: cel(row, "matriculaLider"),
    });
  }
  return { erro: null, linhas, colunas };
}

// valida as linhas extraídas. Retorna linhas anotadas (status ok/alerta/erro
// + mensagens + liderValido) e um resumo.
//   matriculasBanco: Set de codigo_dp já existentes (para novos x atualizados)
//   situacoesValidas: Set de nomes normalizados aceitos (lista fechada do banco)
export function validarLinhas(linhas, { matriculasBanco = new Set(), situacoesValidas = null } = {}) {
  const vistas = new Set();
  const noArquivo = new Set(linhas.map((l) => l.matricula).filter(Boolean));
  const liderDe = {}; // matricula -> matricula do líder (para checar ciclos)
  linhas.forEach((l) => { if (l.matricula) liderDe[l.matricula] = l.matriculaLider; });

  function temCiclo(m) {
    let atual = liderDe[m];
    const passos = new Set([m]);
    while (atual) {
      if (passos.has(atual)) return true;
      passos.add(atual);
      atual = liderDe[atual];
    }
    return false;
  }

  const anotadas = linhas.map((l) => {
    const erros = [];
    const alertas = [];

    if (!l.matricula) erros.push("Matrícula vazia");
    else if (vistas.has(l.matricula)) erros.push(`Matrícula duplicada no arquivo (${l.matricula})`);
    else vistas.add(l.matricula);

    if (!l.nome) erros.push("Nome vazio");

    if (!l.situacao) alertas.push("Situação não informada");
    else if (situacoesValidas && !situacoesValidas.has(normalizar(l.situacao)))
      erros.push(`Situação "${l.situacao}" fora da lista válida`);

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
      } else if (temCiclo(l.matricula)) {
        alertas.push("Ciclo de liderança detectado (A lidera B que lidera A)");
      }
    } else {
      alertas.push("Sem líder (raiz do organograma)");
    }

    const tipo = l.matricula.toUpperCase().startsWith("PJ") ? "PJ" : "CLT";
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
