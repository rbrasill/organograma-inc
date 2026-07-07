// Dados reais da área de Tecnologia da Informação (base Organograma Institucional v1).
// A hierarquia é montada a partir do campo `lider`. Trocar de área = trocar este conjunto.

export const AREA = "Tecnologia da Informação";

export const PESSOAS = [
  { id: "PJ1008", nome: "Felipe Rodrigues Martins", cargo: "", local: "Tecnologia da Informação", situacao: "Ativo", lider: null, pj: true },
  { id: "010087", nome: "Diogo Bergson Marques da Silva", cargo: "Gerente Corporativo de TI", local: "Rossi - TI", situacao: "Ativo", lider: "PJ1008" },
  { id: "PJ1023", nome: "Raphael Soares Moreira", cargo: "", local: "Tecnologia da Informação", situacao: "Ativo", lider: "PJ1008", pj: true },
  { id: "016247", nome: "Pedro Detoni Pereira", cargo: "Estagiario Financeiro", local: "Rossi - Administrativo", situacao: "Ativo", lider: "PJ1008" },
  { id: "010333", nome: "Flavio de Paulo Maurilio", cargo: "Analista de Infraestrutura", local: "Rossi - TI", situacao: "Ativo", lider: "010087" },
  { id: "010308", nome: "Victor Marinho da Silva", cargo: "Analista de Infraestrutura", local: "Rossi - TI", situacao: "Ativo", lider: "010087" },
  { id: "014381", nome: "Igor Demolinari Neiva", cargo: "Analista de Sistemas", local: "Rossi - TI", situacao: "Ativo", lider: "010087" },
  { id: "011537", nome: "Rafael Franca de Freitas", cargo: "Analista de Sistemas", local: "Rossi - TI", situacao: "Ativo", lider: "010087" },
  { id: "014766", nome: "Kaike de Souza Fernandes", cargo: "Desenvolvedor de Sistemas", local: "Rossi - Administrativo", situacao: "Ativo", lider: "010087" },
  { id: "015817", nome: "Ana Julia Moraes Pires Goncalves", cargo: "Auxiliar Administrativo", local: "Rossi - Administrativo", situacao: "Ativo", lider: "010087" },
  { id: "016086", nome: "Fabiano Camara Titoneli", cargo: "Estagiario T.I", local: "Rossi - Administrativo", situacao: "Ativo", lider: "010087" },
  { id: "015929", nome: "Gabriel Fulco Nunes", cargo: "Estagiario T.I", local: "Rossi - Administrativo", situacao: "Ativo", lider: "010087" },
  { id: "015883", nome: "Jean de Souza Morais", cargo: "Estagiario T.I", local: "Rossi - Administrativo", situacao: "Ativo", lider: "010087" },
  { id: "016037", nome: "Victor Wingert de Almeida", cargo: "Estagiario T.I", local: "Rossi - Administrativo", situacao: "Ativo", lider: "010087" },
  { id: "016369", nome: "Alexandre de Oliveira Nogueira Junior", cargo: "Aprendiz", local: "Rossi - Administrativo", situacao: "Ativo", lider: "010087" },
  { id: "015639", nome: "Lucas Moreira Abreu", cargo: "Aprendiz", local: "Rossi - Administrativo", situacao: "Ativo", lider: "010087" },
  { id: "015204", nome: "Ythalo Miguel Gouvea Germano Dutra Ribeiro da Silva", cargo: "Aprendiz", local: "Rossi - Administrativo", situacao: "Ativo", lider: "010087" },
  { id: "016674", nome: "Joao Victor Correa Sobreira", cargo: "Aprendiz", local: "Rossi - Administrativo", situacao: "Ativo", lider: "010087" },
];

// Nível hierárquico (demo, derivado do cargo). Em produção vem da tabela de níveis por cargo.
export function nivelDe(cargo) {
  const c = (cargo || "").toLowerCase();
  if (!c) return 1; // Head / Diretor (topo)
  if (c.includes("gerente")) return 2;
  if (c.includes("analista") || c.includes("desenvolvedor") || c.includes("coordenador")) return 3;
  if (c.includes("auxiliar") || c.includes("assistente")) return 4;
  if (c.includes("estagi")) return 5;
  if (c.includes("aprendiz")) return 6;
  return 3;
}

export const NIVEIS = [
  { n: 1, label: "Direção / Head", cor: "var(--n1)" },
  { n: 2, label: "Gerência", cor: "var(--n2)" },
  { n: 3, label: "Analista / Dev", cor: "var(--n3)" },
  { n: 4, label: "Assistente / Aux.", cor: "var(--n4)" },
  { n: 5, label: "Estágio", cor: "var(--n5)" },
  { n: 6, label: "Aprendiz", cor: "var(--n6)" },
];

export const RAIZES_PERMITIDAS = new Set([null]); // no exemplo, o topo da área (Felipe) é raiz

// Inconsistências (ilustrativo). Em produção, as regras rodam no banco.
// byId só cobre a área carregada — um líder fora dela é válido (ex.: líder
// de área que responde a um Diretor de outro setor). A API já resolve o
// nome do líder cross-area (liderNome), então só é "não encontrado" de
// verdade quando nem o nome veio preenchido.
export function inconsistenciasDe(p, byId) {
  const alertas = [];
  if (!p.cargo) alertas.push("Cargo não informado");
  if (!p.situacao) alertas.push("Situação não informada");
  if (p.lider && !byId[p.lider] && !p.liderNome) alertas.push("Líder não encontrado na base");
  if (p.lider === p.id) alertas.push("Colaborador é o próprio líder");
  return alertas;
}

// helpers de árvore
export function construirIndice(pessoas) {
  return Object.fromEntries(pessoas.map((p) => [p.id, p]));
}
export function construirArvore(pessoas) {
  const byId = construirIndice(pessoas);
  const nodes = Object.fromEntries(pessoas.map((p) => [p.id, { ...p, children: [] }]));
  const roots = [];
  pessoas.forEach((p) => {
    if (p.lider && nodes[p.lider]) nodes[p.lider].children.push(nodes[p.id]);
    else roots.push(nodes[p.id]);
  });
  return { roots, byId };
}

// normaliza para busca (sem acento, minúsculo)
export function normalizar(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// ===== Listas de referência (mock). Em produção, vêm das tabelas de lookup do banco. =====
export const CARGOS = [
  "Gerente Corporativo de TI", "Analista de Infraestrutura", "Analista de Sistemas",
  "Desenvolvedor de Sistemas", "Auxiliar Administrativo", "Estagiario T.I",
  "Estagiario Financeiro", "Aprendiz", "Coordenador de TI", "Diretor de Tecnologia da Informação",
];
export const AREAS = [
  "Tecnologia da Informação", "Financeiro", "Suprimentos", "Jurídico", "Marketing",
  "Departamento Pessoal", "Comercial", "Engenharia", "Obra",
];
export const LOCAIS = [
  "Rossi - TI", "Rossi - Administrativo", "Tecnologia da Informação - Rossi",
  "Rossi - Financeiro", "Rossi - Jurídico", "Rossi - Marketing",
];
export const SITUACOES = ["Ativo", "Afastado", "Férias", "Aviso Prévio", "Inativo", "Desligado"];

// líderes possíveis = os próprios colaboradores (dropdown com busca)
export function opcoesLider(pessoas, excluirId) {
  return pessoas.filter((p) => p.id !== excluirId).map((p) => ({ id: p.id, nome: p.nome, cargo: p.cargo }));
}
