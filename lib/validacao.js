// Regras de obrigatoriedade do cadastro de colaboradores (PJ e CLT).
// Fonte ÚNICA para tela e API: o formulário usa para marcar os campos com *,
// destacar o que falta e bloquear o botão; a rota /api/colaboradores/gestao usa
// para recusar payload incompleto. Assim a integridade não depende de o
// cliente ter validado — quem chamar a API direto passa pela mesma régua.

import { cpfValido, soDigitos } from "@/lib/cpf";

export const ROTULOS = {
  nome: "Nome",
  cpf: "CPF",
  email: "E-mail",
  telefone: "Telefone",
  cargoId: "Cargo",
  setorId: "Área / Setor",
  localId: "Local de trabalho",
  regionalId: "Regional",
  situacaoId: "Situação",
  sexo: "Sexo",
  pcd: "PCD",
  quantidadeFilhos: "Quantidade de filhos",
  liderMatricula: "Líder direto",
  dataAdmissao: "Data de admissão",
  dataNascimento: "Data de nascimento",
};

// Cadastro NOVO (hoje só PJ; CLT entra pela importação do extrato do DP).
// Régua cheia: é registro novo, não há legado para tolerar.
// "situacaoId" não entra aqui de propósito — todo cadastro novo nasce como
// "Ativo", definido no servidor, então não é um campo que possa ficar vazio.
// "regionalId" saiu da régua porque a regional SEGUE o local (vínculo
// local→regional): o campo obrigatório passou a ser o LOCAL, e o servidor
// deriva a regional dele.
export const OBRIGATORIOS_NOVO = [
  "nome", "cpf", "cargoId", "setorId", "localId", "liderMatricula", "dataAdmissao",
];

// Edição de quem JÁ está na base: só os campos que hoje estão 100% preenchidos
// nos ativos. Exigir CPF/líder/datas aqui travaria registros legítimos que
// vieram incompletos do DP (ex.: pessoas sem líder no extrato) — esses viram
// pendência informativa, nunca bloqueio de save.
export const OBRIGATORIOS_EDICAO = ["nome", "cargoId", "setorId", "localId", "situacaoId"];

// Faltam para o cadastro ficar completo, mas não impedem salvar.
export const PENDENCIAS_EDICAO = ["cpf", "regionalId", "liderMatricula", "dataAdmissao"];

const vazio = (v) => String(v ?? "").trim() === "";

export function emailValido(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
}

// data do input type=date: ISO bem formado e que existe no calendário
// (rejeita 2025-02-31, que a regex sozinha aceitaria)
export function dataIso(v) {
  const s = String(v || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

const hojeIso = () => new Date().toISOString().slice(0, 10);

// campos obrigatórios que ficaram em branco, na ordem em que aparecem na tela
export function camposFaltantes(campos, obrigatorios) {
  return obrigatorios.filter((c) => vazio(campos?.[c]));
}

// Valida um cadastro inteiro.
//   novo=true  → régua do cadastro novo (OBRIGATORIOS_NOVO)
//   novo=false → régua da edição (OBRIGATORIOS_EDICAO)
// Retorna { ok, faltantes: [campo], erros: { campo: mensagem } }.
// "faltantes" = obrigatório em branco; "erros" = preenchido mas inconsistente.
export function validarColaborador(campos = {}, { novo = false } = {}) {
  const faltantes = camposFaltantes(campos, novo ? OBRIGATORIOS_NOVO : OBRIGATORIOS_EDICAO);
  const erros = {};

  if (!vazio(campos.cpf) && !cpfValido(campos.cpf)) {
    erros.cpf = "CPF inválido — confira os números digitados.";
  }
  if (!vazio(campos.email) && !emailValido(campos.email)) {
    erros.email = "E-mail em formato inválido.";
  }

  // datas: precisam existir e não podem ser no futuro
  const hoje = hojeIso();
  for (const campo of ["dataAdmissao", "dataNascimento"]) {
    if (vazio(campos[campo])) continue;
    const iso = dataIso(campos[campo]);
    if (!iso) { erros[campo] = `${ROTULOS[campo]} inválida.`; continue; }
    if (iso > hoje) erros[campo] = `${ROTULOS[campo]} não pode ser no futuro.`;
  }
  // dados pessoais (mig. 13) — opcionais, mas quando vêm têm formato fechado:
  // sexo só 'M'/'F'; quantidade de filhos inteiro >= 0 (possui_filhos é
  // DERIVADO dela pelo banco, nunca chega como campo editável)
  if (!vazio(campos.sexo) && !["M", "F"].includes(String(campos.sexo).trim().toUpperCase())) {
    erros.sexo = "Sexo deve ser 'M' (masculino) ou 'F' (feminino).";
  }
  if (!vazio(campos.quantidadeFilhos)) {
    const n = Number(String(campos.quantidadeFilhos).trim());
    if (!Number.isInteger(n) || n < 0) {
      erros.quantidadeFilhos = "Quantidade de filhos deve ser um número inteiro maior ou igual a zero.";
    }
  }

  // nascimento tem de vir antes da admissão (pega ano trocado nas duas)
  const nasc = dataIso(campos.dataNascimento);
  const adm = dataIso(campos.dataAdmissao);
  if (nasc && adm && nasc >= adm && !erros.dataNascimento && !erros.dataAdmissao) {
    erros.dataNascimento = "A data de nascimento tem de ser anterior à de admissão.";
  }

  return { ok: faltantes.length === 0 && Object.keys(erros).length === 0, faltantes, erros };
}

// "Nome, CPF e Cargo" — enumeração em pt-BR para a mensagem de erro
export function listarRotulos(campos) {
  const nomes = campos.map((c) => ROTULOS[c] || c);
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

// mensagem única para devolver na API / mostrar no topo do formulário
export function mensagemValidacao({ faltantes, erros }) {
  const partes = [];
  if (faltantes?.length) {
    partes.push(`Preencha ${faltantes.length === 1 ? "o campo obrigatório" : "os campos obrigatórios"}: ${listarRotulos(faltantes)}.`);
  }
  for (const msg of Object.values(erros || {})) partes.push(msg);
  return partes.join(" ");
}

// CPF só com dígitos, como o banco guarda (reexportado para a API não precisar
// importar de dois módulos)
export { soDigitos, cpfValido };
