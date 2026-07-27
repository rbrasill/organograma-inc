// Perfis de acesso do portal (fase 2 do login por CPF) — constantes PURAS,
// importáveis de qualquer runtime (cliente, Node e Edge/middleware).
//
//   PADRAO      (sem linha em usuario_perfil) → só visualiza o organograma
//   COLABORADOR → + baixar imagem, ver Diretorias, solicitar ajuste
//   GESTOR      → + exportar Excel (sem nenhuma edição)
//   ADMIN       → acesso completo
//
// O perfil vira claim na sessão no LOGIN — mudar o perfil de alguém vale a
// partir do próximo login dele.

export const NIVEL = { PADRAO: 0, COLABORADOR: 1, GESTOR: 2, ADMIN: 3 };

export const PERFIS_PROMOVIDOS = ["COLABORADOR", "GESTOR", "ADMIN"];

export const ROTULO = {
  PADRAO: "Padrão (só visualização)",
  COLABORADOR: "Colaborador",
  GESTOR: "Gestor",
  ADMIN: "Administrador",
};

// nível numérico de um perfil; desconhecido/ausente = PADRÃO (menor acesso)
export function nivelDe(perfil) {
  return NIVEL[perfil] ?? NIVEL.PADRAO;
}
