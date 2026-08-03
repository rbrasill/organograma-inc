// Lógica compartilhada da importação por Excel (cliente e servidor).
// Regras conforme CLAUDE.md seção 7: upsert por matrícula, normalização,
// validação com prévia. Linhas com ERRO são puladas; ALERTAS entram e ficam
// visíveis como inconsistência no portal.

import { normalizar } from "@/data/ti";
import { cpfValido } from "@/lib/cpf";

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

// O extrato do DP abrevia nomes de cargo que já existem por extenso no
// catálogo. Sem este mapa, cada importação criaria quase-duplicatas
// ("Analista Depart. Pessoal" ao lado de "Analista de Departamento Pessoal").
// Revisado à mão — só equivalências inequívocas.
const ALIAS_CARGO = {
  "supervisor(a) relacionamento com cliente": "supervisor de relacionamento com cliente",
  "estagiario arquitetura e urban": "estagiario de arquitetura e urbanismo",
  "tecnico orcamentista obras": "tecnico orcamentista de obras",
  "analista planejamento e controle": "analista de planejamento e controle",
  "assistente plan e controle": "assistente de planejamento e controle",
  "coordenador(a) departamento pessoal": "coordenador de departamento pessoal",
  "coordenador (a) de contratacao de empreendimento": "coordenador de contratacao de empreendimento",
  "analista de plan financeiro": "analista de planejamento financeiro",
  "assessor diretoria": "assessor de diretoria",
  "supervisor(a) departamento pessoal": "supervisor de departamento pessoal",
  "analista de rec. humanos": "analista de recursos humanos",
  "estagiario t.i": "estagiario de ti",
  "encarregado almoxarifado": "encarregado de almoxarifado",
  "meio oficial carpinteiro": "meio oficial de carpinteiro",
  "operador mini pa carregad.": "operador de mini pa carregadeira",
  "analista assistencia tecnica": "analista de assistencia tecnica",
  "auxiliar fiinanceiro": "auxiliar financeiro", // typo recorrente do DP
  "assistente depart. pessoal": "assistente de departamento pessoal",
  "analista depart. pessoal": "analista de departamento pessoal",
  "auxiliar depart. pessoal": "auxiliar de departamento pessoal",
  "tecnico seg. trabalho": "tecnico de seguranca do trabalho",
  "supervisor seg. trabalho": "supervisor de seguranca do trabalho",
  "supervisor contr. tecnolog.": "supervisor de controle tecnologico",
};

// normalização de cargo para matching: colapsa espaços, normaliza grafia e
// aplica o alias do DP. Usar SEMPRE que for casar cargo por nome.
export function cargoNormalizado(nome) {
  const n = normalizar(String(nome || "").trim().replace(/\s+/g, " "));
  return ALIAS_CARGO[n] || n;
}

// código de cargo do DP para MATCHING: só dígitos, sem zeros à esquerda
// ("089" ≡ "89" ≡ célula numérica do Excel). A grafia oficial ("089") é o
// que se grava; esta forma é só a chave de comparação. "" quando não há código.
export function normalizarCodigoCargo(v) {
  return String(v ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

// família de nível pelo NOME do cargo: prefixo mais longo com fronteira de
// palavra ("Vice-Diretor Comercial"→Vice-Diretor, não Diretor; "Encarregado
// de Armador"→Encarregado, não Armador). `familias` = [{ id, familia }].
// Retorna a entrada casada ou null (ex.: "Administrador" não tem família).
export function familiaDoCargo(nomeCargo, familias) {
  const alvo = cargoNormalizado(nomeCargo);
  let melhor = null;
  for (const f of familias || []) {
    const pref = normalizar(String(f.familia || "").trim());
    if (!pref) continue;
    if (alvo === pref || (alvo.startsWith(pref) && alvo[pref.length] === " ")) {
      if (!melhor || pref.length > normalizar(melhor.familia).length) melhor = f;
    }
  }
  return melhor;
}

// mapeia os cabeçalhos da planilha para os campos internos. Reconhece o
// formato ATUAL do extrato do DP (v3/9 colunas: CHAPA, FUNCIONARIO, Cargo,
// Codigo Cargo, CPF, DATA NASCIMENTO, Data Admissão, SITUACAO, LOCAL DE
// TRABALHO) e mantém compatibilidade com o formato v2 (18 colunas).
// Casa por conteúdo normalizado, tolerando variações de grafia.
// Cuidado: colunas de CÓDIGO ("Codigo Cargo", "Codigo Setor"…) contêm as
// mesmas palavras dos nomes — os códigos são testados ANTES dos nomes.
function identificarColunas(cabecalhos) {
  const idx = {};
  cabecalhos.forEach((h, i) => {
    const n = normalizar(String(h || ""));
    if (!n) return;
    const cod = n.includes("cod"); // "cod" ou "codigo"

    // matrícula: "CHAPA" (v3) ou "Cod. Colaborador..." (v2, não é a situação)
    if (n === "chapa") idx.matricula = i;
    else if (cod && n.includes("colaborador") && !n.includes("situa")) idx.matricula = i;
    else if (n.includes("cpf")) idx.cpf = i;                                      // "CPF"/"CPF Colaborador"
    else if (n.includes("nascimento")) idx.dataNascimento = i;                    // v3: DATA NASCIMENTO
    else if (n.includes("admiss")) idx.dataAdmissao = i;                          // v3: Data Admissão
    else if (n.includes("funcionario")) idx.nome = i;                             // v3: FUNCIONARIO
    else if (n.includes("nome") && n.includes("colaborador")) idx.nome = i;       // v2
    else if (n.includes("nome") && n.includes("lider")) idx.nomeLider = i;        // ignorado (derivado)
    else if (n.includes("matricula") && n.includes("lider")) idx.matriculaLider = i;
    else if (n.includes("tipo") && n.includes("contrata")) idx.tipo = i;          // v2: CLT/PJ explícito
    else if (n.includes("nivel") && n.includes("hierarquia")) idx.codigoNH = i;   // v2: NH… (define o nível)
    else if (n.includes("nivel")) return;                                         // demais colunas de nível: ignoradas
    else if (cod && n.includes("setor")) idx.codigoSetor = i;                     // v2: SET…
    else if (cod && n.includes("cargo")) idx.codigoCargo = i;
    else if (cod && n.includes("situa")) idx.codigoSituacao = i;                  // v2: letra
    else if (cod && n.includes("local")) idx.codigoLocal = i;                     // v2 (LOCTRA…, normalizado p/ número)
    else if (n.includes("setor")) idx.setor = i;
    else if (n.includes("cargo")) idx.cargo = i;
    else if (n.includes("situa")) idx.situacao = i;
    else if (n.includes("local")) idx.local = i;
    else if (n.includes("regional")) idx.regional = i;
    else if (n === "sexo" || n.includes("sexo")) idx.sexo = i;                    // mig. 13
    else if (n === "pcd" || n.includes("deficien")) idx.pcd = i;                  // "PCD"/"Pessoa com Deficiência"
  });
  return idx;
}

// converte datas do extrato para ISO (YYYY-MM-DD) ou null:
//   "17/06/2019" (texto BR) · "2019-06-17" (ISO) · 46210 (serial do Excel,
//   epoch 1899-12-30 — aparece nas admissões mais recentes do extrato)
export function dataISO(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/^\d{4,6}$/.test(s)) { // serial do Excel
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

// sexo do extrato → 'M'/'F' ou null. Aceita "M", "F", "Masculino", "Feminino"
// (e variações de caixa/acento). Valor presente mas irreconhecível → null,
// com alerta na validação (não bloqueia a linha).
export function sexoNormalizado(v) {
  const s = normalizar(String(v || "").trim());
  if (!s) return null;
  if (s === "m" || s.startsWith("masc")) return "M";
  if (s === "f" || s.startsWith("fem")) return "F";
  return null;
}

// PCD do extrato → 1 (Sim), 0 (Não) ou null (em branco/irreconhecível)
export function simNaoNormalizado(v) {
  const s = normalizar(String(v || "").trim());
  if (!s) return null;
  if (s === "sim" || s === "s" || s === "1") return 1;
  if (s === "nao" || s === "n" || s === "0") return 0;
  return null;
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
    // CPF: só dígitos; célula numérica perde zeros à esquerda no Excel —
    // completa até 11 (CPF tem tamanho fixo)
    const cpfCru = cel(row, "cpf").replace(/\D/g, "");
    linhas.push({
      linha: r + 1, // número da linha no Excel (1-based, contando o cabeçalho)
      matricula: cel(row, "matricula"),
      nome: cel(row, "nome"),
      cpf: cpfCru && cpfCru.length >= 9 && cpfCru.length <= 11 ? cpfCru.padStart(11, "0") : cpfCru,
      tipo: cel(row, "tipo"),               // v2: CLT/PJ (explícito)
      cargo: cel(row, "cargo"),
      codigoCargo: cel(row, "codigoCargo"),
      codigoNH: cel(row, "codigoNH"),       // v2: NH… (nível do cargo)
      setor: cel(row, "setor"),
      codigoSetor: cel(row, "codigoSetor"), // v2: SET…
      local: localTxt,
      codigoLocal: codLocalCol || (locParse ? locParse.codigo : ""), // número do DP (v2 LOCTRA… é normalizado)
      dataNascimento: cel(row, "dataNascimento"), // texto cru; validação converte p/ ISO
      dataAdmissao: cel(row, "dataAdmissao"),
      regional: cel(row, "regional"),
      sexo: cel(row, "sexo"),               // mig. 13: 'M'/'F' (aceita por extenso)
      pcd: cel(row, "pcd"),                 // mig. 13: Sim/Não
      situacao: cel(row, "situacao"),
      codigoSituacao: cel(row, "codigoSituacao"), // v2: letra
      matriculaLider: cel(row, "matriculaLider"),
    });
  }
  return { erro: null, linhas, colunas };
}

// valida as linhas extraídas. Retorna linhas anotadas (status ok/alerta/erro
// + mensagens + liderValido) e um resumo.
// A CHAVE DE IDENTIFICAÇÃO é o CPF (a chapa pode mudar no DP; o CPF nunca):
//   * CPF ausente ou inválido (dígitos verificadores) → ERRO, linha pulada;
//   * CPF repetido no arquivo → fica UMA linha (a última com situação "Ativo";
//     sem nenhuma Ativa, a última do arquivo) — as demais são descartadas
//     com o motivo no relatório;
//   * novos × atualizados é decidido por cpfsBanco.
//   matriculasBanco: chapas existentes (validação de líder nos arquivos v2)
//   situacoesValidas: Set de nomes normalizados aceitos (lista fechada do banco)
//   situacoesCodigos: Set de códigos-letra aceitos (v2) — casa por código OU nome
//   colunas: mapa de colunas do arquivo (identificarColunas) — colunas AUSENTES
//            no layout (setor/líder no extrato v3) não geram alertas por linha
export function validarLinhas(linhas, { cpfsBanco = new Set(), matriculasBanco = new Set(), situacoesValidas = null, situacoesCodigos = null, colunas = null } = {}) {
  const temColuna = (c) => !colunas || colunas[c] !== undefined;
  const vistas = new Set();

  // resolução de CPF duplicado DENTRO do arquivo: para cada CPF válido que
  // se repete, mantém a última linha "Ativo" (ou a última, se nenhuma Ativa)
  const porCpf = new Map(); // cpf -> índices das linhas
  linhas.forEach((l, i) => {
    if (!cpfValido(l.cpf)) return;
    if (!porCpf.has(l.cpf)) porCpf.set(l.cpf, []);
    porCpf.get(l.cpf).push(i);
  });
  const descartada = new Map(); // índice -> linha (nº Excel) que foi mantida
  for (const idxs of porCpf.values()) {
    if (idxs.length < 2) continue;
    const ativas = idxs.filter((i) => normalizar(linhas[i].situacao || "") === "ativo");
    const mantida = ativas.length ? ativas[ativas.length - 1] : idxs[idxs.length - 1];
    for (const i of idxs) if (i !== mantida) descartada.set(i, linhas[mantida].linha);
  }

  // consistência interna dos CARGOS: o código é a identidade — o MESMO código
  // com nomes diferentes é sujeira na origem (linhas divergentes do 1º nome
  // visto viram ERRO); o mesmo nome com códigos diferentes vira alerta.
  const cargoConflito = new Map(); // índice -> mensagem de erro
  const cargoAviso = new Map();    // índice -> mensagem de alerta
  {
    const nomeDoCod = new Map(), codDoNome = new Map();
    linhas.forEach((l, i) => {
      const cod = normalizarCodigoCargo(l.codigoCargo);
      const nome = l.cargo ? cargoNormalizado(l.cargo) : "";
      if (!cod || !nome) return;
      if (!nomeDoCod.has(cod)) nomeDoCod.set(cod, { nome, linha: l.linha });
      else if (nomeDoCod.get(cod).nome !== nome)
        cargoConflito.set(i, `Código de cargo ${l.codigoCargo} com nome diferente da linha ${nomeDoCod.get(cod).linha} ("${l.cargo}")`);
      if (!codDoNome.has(nome)) codDoNome.set(nome, { cod, linha: l.linha });
      else if (codDoNome.get(nome).cod !== cod)
        cargoAviso.set(i, `Cargo "${l.cargo}" com código diferente da linha ${codDoNome.get(nome).linha}`);
    });
  }

  // consistência interna dos LOCAIS: mesmo código de obra com nomes
  // diferentes = ERRO nas linhas divergentes. (O inverso — mesmo nome com
  // códigos diferentes — é LEGÍTIMO: existem obras homônimas, ex.: duas
  // "Unique Solare" com códigos 394 e 482.)
  const localConflito = new Map(); // índice -> mensagem de erro
  {
    const nomeDoCod = new Map();
    linhas.forEach((l, i) => {
      const cod = (l.codigoLocal || "").trim();
      if (!cod || !l.local) return;
      const nome = normalizar(String(l.local).replace(/^\d+\s*-\s*/, "").trim().replace(/\s+/g, " "));
      if (!nome) return;
      if (!nomeDoCod.has(cod)) nomeDoCod.set(cod, { nome, linha: l.linha });
      else if (nomeDoCod.get(cod).nome !== nome)
        localConflito.set(i, `Código de local ${cod} com nome diferente da linha ${nomeDoCod.get(cod).linha} ("${l.local}")`);
    });
  }
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

  const anotadas = linhas.map((l, i) => {
    const erros = [];
    const alertas = [];

    // CPF é a chave: ausente/inválido bloqueia a linha; duplicado descarta
    if (!l.cpf) erros.push("CPF ausente — é a chave de identificação");
    else if (!cpfValido(l.cpf)) erros.push(`CPF inválido (${l.cpf})`);
    else if (descartada.has(i))
      erros.push(`CPF repetido no arquivo — mantida a linha ${descartada.get(i)}`);

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
    if (cargoConflito.has(i)) erros.push(cargoConflito.get(i));
    if (cargoAviso.has(i)) alertas.push(cargoAviso.get(i));
    if (localConflito.has(i)) erros.push(localConflito.get(i));
    if (temColuna("setor") && !l.setor) alertas.push("Setor não informado");

    // datas (extrato v3): converte para ISO; data presente mas ilegível = alerta
    const nascISO = dataISO(l.dataNascimento);
    const admISO = dataISO(l.dataAdmissao);
    if (l.dataNascimento && !nascISO) alertas.push(`Data de nascimento ilegível ("${l.dataNascimento}")`);
    if (l.dataAdmissao && !admISO) alertas.push(`Data de admissão ilegível ("${l.dataAdmissao}")`);

    // dados pessoais (mig. 13): presente mas irreconhecível = alerta, o campo
    // entra em branco (não sobrescreve o que já está no banco — COALESCE)
    const sexoNorm = sexoNormalizado(l.sexo);
    const pcdNorm = simNaoNormalizado(l.pcd);
    if (l.sexo && !sexoNorm) alertas.push(`Sexo ilegível ("${l.sexo}") — esperado M/F ou Masculino/Feminino`);
    if (l.pcd && pcdNorm === null) alertas.push(`PCD ilegível ("${l.pcd}") — esperado Sim ou Não`);

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
    } else if (temColuna("matriculaLider")) {
      alertas.push("Sem líder (raiz do organograma)");
    }

    // tipo de contratação: coluna explícita da v2; fallback = prefixo "PJ"
    const tipo = l.tipo
      ? (normalizar(l.tipo).includes("pj") ? "PJ" : "CLT")
      : (String(l.matricula).toUpperCase().startsWith("PJ") ? "PJ" : "CLT");
    const existente = cpfsBanco.has(l.cpf); // identidade é o CPF
    const status = erros.length ? "erro" : alertas.length ? "alerta" : "ok";
    return { ...l, tipo, existente, liderValido, nascISO, admISO, sexoNorm, pcdNorm, status, erros, alertas };
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
