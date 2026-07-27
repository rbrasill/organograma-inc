-- 11: validação do organograma por área.
-- Uma linha por setor com a ÚLTIMA validação. O "validado/pendente" não é um
-- flag gravado: compara-se o hash_estrutura salvo com o hash ATUAL da área
-- (pessoas ativas + cargo + nível efetivo + líder). Qualquer mudança
-- estrutural — entrada/saída de gente, troca de líder, cargo, área ou nível
-- (inclusive nível padrão do cargo no catálogo) — muda o hash e o status
-- volta a "pendente" sozinho, sem depender de instrumentar cada tela.

CREATE TABLE IF NOT EXISTS area_validacao (
  setor_id          CHAR(36)     NOT NULL,
  hash_estrutura    CHAR(64)     NOT NULL,               -- sha256 da estrutura no momento da validação
  validado_em       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  validado_por_id   CHAR(36)     NULL,                   -- colaborador da sessão (auditoria; a tela mostra só a data)
  validado_por_nome VARCHAR(200) NULL,
  PRIMARY KEY (setor_id),
  CONSTRAINT fk_areaval_setor FOREIGN KEY (setor_id) REFERENCES setor (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
