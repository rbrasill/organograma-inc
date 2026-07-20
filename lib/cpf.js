// Utilitários de CPF — máscara de exibição, dígitos e validação oficial.
// O banco guarda o CPF só com DÍGITOS (o login por CPF casa por igualdade),
// então a máscara é só para a tela; o que se persiste vem de soDigitos().

export function soDigitos(v) {
  return String(v || "").replace(/\D/g, "").slice(0, 11);
}

// máscara progressiva 000.000.000-00 (aplica conforme o usuário digita)
export function formatarCpf(v) {
  const d = soDigitos(v);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

// dígito verificador do CPF: soma ponderada (peso decrescente), módulo 11;
// resto < 2 → dígito 0, senão 11 - resto.
function digitoVerificador(parcial, pesoInicial) {
  let soma = 0;
  for (let i = 0; i < parcial.length; i++) {
    soma += Number(parcial[i]) * (pesoInicial - i);
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

// validação oficial do CPF: 11 dígitos, não todos iguais (ex.: 111.111.111-11
// é matematicamente válido mas inexistente → rejeitado), e os dois dígitos
// verificadores conferem.
export function cpfValido(v) {
  const cpf = soDigitos(v);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  if (digitoVerificador(cpf.slice(0, 9), 10) !== Number(cpf[9])) return false;
  if (digitoVerificador(cpf.slice(0, 10), 11) !== Number(cpf[10])) return false;
  return true;
}
