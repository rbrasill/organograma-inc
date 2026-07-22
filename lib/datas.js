// Helpers de data para exibição (aniversário e tempo de empresa).
// Entrada esperada: "YYYY-MM-DD" (formato que a API devolve via DATE_FORMAT).

// "YYYY-MM-DD" → "DD/MM/AAAA" (vazio se não reconhecer)
export function dataBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function parseISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// meses completos entre a data e hoje (base para idade e tempo de empresa)
function mesesDesde(iso) {
  const d = parseISO(iso);
  if (!d) return null;
  const hoje = new Date();
  let meses = (hoje.getFullYear() - d.getFullYear()) * 12 + (hoje.getMonth() - d.getMonth());
  if (hoje.getDate() < d.getDate()) meses--;
  return meses < 0 ? 0 : meses;
}

// idade em anos completos (null se data inválida)
export function idade(iso) {
  const m = mesesDesde(iso);
  return m == null ? null : Math.floor(m / 12);
}

// tempo de empresa legível: "3 anos", "1 ano e 2 meses", "5 meses"
// (no primeiro ano mostra meses). "" se data inválida.
export function tempoDeEmpresa(iso) {
  const total = mesesDesde(iso);
  if (total == null) return "";
  const anos = Math.floor(total / 12);
  const meses = total % 12;
  if (anos <= 0) return `${meses} ${meses === 1 ? "mês" : "meses"}`;
  const txtA = `${anos} ${anos === 1 ? "ano" : "anos"}`;
  if (meses === 0) return txtA;
  return `${txtA} e ${meses} ${meses === 1 ? "mês" : "meses"}`;
}
