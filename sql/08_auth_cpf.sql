-- ============================================================================
-- Migração 08 — Login por CPF + data de nascimento (rate-limit de tentativas)
-- ============================================================================
-- O acesso ao portal passa a ser CPF + data de nascimento (dados que o extrato
-- do DP cobre 100%). Como a credencial é fraca (CPF/nascimento não são
-- segredos), o endpoint /api/auth/entrar aplica limites de tentativa e esta
-- tabela é o registro usado nas janelas de contagem:
--   * >= 5 falhas do MESMO CPF em 15 min  → bloqueio temporário (429)
--   * >= 30 tentativas do MESMO IP em 1 h → bloqueio temporário (429)
-- Linhas com mais de 1 dia são apagadas oportunisticamente pelo endpoint.
--
-- A tabela auth_codigo e o fluxo de código por e-mail (Pipedream) ficam
-- INTACTOS e dormentes — na fase 2 (perfis de acesso), o login por e-mail
-- volta como fator forte para administradores.
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_login_tentativa (
  id        CHAR(36)    NOT NULL,
  cpf       VARCHAR(11) NOT NULL,
  ip        VARCHAR(64) NULL,
  sucesso   TINYINT(1)  NOT NULL DEFAULT 0,
  criado_em DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_alt_cpf (cpf, criado_em),
  KEY ix_alt_ip (ip, criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
