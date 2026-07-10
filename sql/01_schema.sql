-- ============================================================================
-- Portal de Organograma — INC Empreendimentos
-- Schema do banco de dados (MySQL 5.7) — conforme Modelagem, seção 6
-- ============================================================================
-- Banco alvo: rentis39_organograma_inc (MySQL 5.7.44)
--
-- Convenções (decisões já tomadas — ver CLAUDE.md):
--   * PK = UUID v4 em CHAR(36) (legibilidade). MySQL 5.7 NÃO gera UUID por
--     DEFAULT; o id é gerado pela aplicação (ou via UUID() no INSERT).
--   * Tabelas de referência (lookup) têm `nome` (exibição) + `nome_normalizado`
--     (UNIQUE) para deduplicação na importação/criação automática.
--   * Soft delete via colaborador.ativo — nada é apagado; histórico preserva.
--   * Códigos do DP (codigo_dp / codigo_cargo_dp) são referência externa,
--     nunca a chave.
--
-- Observações sobre o MySQL 5.7:
--   * CHECK constraints são ACEITAS na sintaxe mas NÃO são impostas (só a
--     partir do 8.0.16). Por isso as regras de integridade da árvore
--     (sem ciclo, lider_id != id, raízes permitidas, nível do líder coerente)
--     são validadas na APLICAÇÃO, não no banco. Ver seção "REGRAS" ao final.
--   * Tipo JSON é suportado (5.7.8+) — usado em payloads de importação/solicitação.
--   * ENUM, FK (InnoDB), DATETIME DEFAULT/ON UPDATE CURRENT_TIMESTAMP: OK no 5.7.
--
-- Ordem de criação respeita as dependências de FK. A dependência circular
-- setor <-> colaborador é resolvida criando a coluna setor.lider_colaborador_id
-- sem FK e adicionando a FK via ALTER TABLE após criar colaborador.
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- BLOCO 1 — Tabelas de referência (lookup)
-- ---------------------------------------------------------------------------

-- 1.1 nivel_hierarquico — catálogo de FAMÍLIAS de nível (base v2).
--   codigo_nh (NH500–NH544): chave externa oficial, única.
--   ordem (1–18, 1 = topo): NÃO é única — várias famílias compartilham a
--   mesma altura hierárquica, distinguidas por `variacao` (A–L).
--   A validação de coerência da árvore usa `ordem` (líder deve ter ordem
--   menor que o subordinado), ignorando a variação/família.
CREATE TABLE IF NOT EXISTS nivel_hierarquico (
  id         CHAR(36)     NOT NULL,
  codigo_nh  VARCHAR(20)  NULL,
  ordem      INT          NOT NULL,
  variacao   VARCHAR(4)   NULL,
  cod_var    VARCHAR(10)  NULL,
  familia    VARCHAR(120) NULL,
  cor        VARCHAR(9)   NULL,   -- cor oficial da família (hex, ex.: #1565C0)
  PRIMARY KEY (id),
  UNIQUE KEY uq_nivel_nh (codigo_nh),
  KEY ix_nivel_ordem (ordem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.2 cargo
--   nivel_id é NULL: na importação um cargo pode ser criado antes de ter o
--   nível definido (a tabela de nível por cargo ainda será curada — seção 8).
CREATE TABLE IF NOT EXISTS cargo (
  id                CHAR(36)     NOT NULL,
  codigo_cargo_dp   VARCHAR(40)  NULL,
  nome              VARCHAR(160) NOT NULL,
  nome_normalizado  VARCHAR(160) NOT NULL,
  nivel_id          CHAR(36)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cargo_norm (nome_normalizado),
  KEY ix_cargo_nivel (nivel_id),
  CONSTRAINT fk_cargo_nivel FOREIGN KEY (nivel_id) REFERENCES nivel_hierarquico (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.3 setor (área)
--   setor_pai_id: preparado para hierarquia de áreas (não usado ainda).
--   lider_colaborador_id: FK adicionada por ALTER após criar colaborador.
CREATE TABLE IF NOT EXISTS setor (
  id                    CHAR(36)     NOT NULL,
  codigo_dp             VARCHAR(20)  NULL,   -- código oficial do DP (SET…)
  nome                  VARCHAR(160) NOT NULL,
  nome_normalizado      VARCHAR(160) NOT NULL,
  setor_pai_id          CHAR(36)     NULL,
  lider_colaborador_id  CHAR(36)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_setor_norm (nome_normalizado),
  UNIQUE KEY uq_setor_dp (codigo_dp),
  KEY ix_setor_pai (setor_pai_id),
  KEY ix_setor_lider (lider_colaborador_id),
  CONSTRAINT fk_setor_pai FOREIGN KEY (setor_pai_id) REFERENCES setor (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.4 local_trabalho
CREATE TABLE IF NOT EXISTS local_trabalho (
  id                CHAR(36)     NOT NULL,
  codigo_dp         VARCHAR(20)  NULL,   -- código oficial do DP (LOCTRA…)
  nome              VARCHAR(160) NOT NULL,
  nome_normalizado  VARCHAR(160) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_local_norm (nome_normalizado),
  UNIQUE KEY uq_local_dp (codigo_dp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.5 regional
CREATE TABLE IF NOT EXISTS regional (
  id                CHAR(36)     NOT NULL,
  nome              VARCHAR(160) NOT NULL,
  nome_normalizado  VARCHAR(160) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_regional_norm (nome_normalizado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.6 situacao — lista fechada; ativo_na_arvore controla se aparece no organograma
CREATE TABLE IF NOT EXISTS situacao (
  id                CHAR(36)    NOT NULL,
  codigo_dp         VARCHAR(8)  NULL,   -- código-letra do DP (A, F, V, P, …)
  nome              VARCHAR(80) NOT NULL,
  nome_normalizado  VARCHAR(80) NOT NULL,
  ativo_na_arvore   TINYINT(1)  NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_situacao_norm (nome_normalizado),
  UNIQUE KEY uq_situacao_dp (codigo_dp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- BLOCO 2 — Núcleo
-- ---------------------------------------------------------------------------

-- 2.1 colaborador
--   FKs de cargo/setor/local/situacao são NULL no banco para tolerar a carga
--   inicial (a base Excel tem campos em branco). A obrigatoriedade para
--   registros ATIVOS é validada na aplicação/importação.
--   lider_id NULL apenas para as raízes permitidas (ver REGRAS).
CREATE TABLE IF NOT EXISTS colaborador (
  id                CHAR(36)         NOT NULL,
  codigo_dp         VARCHAR(40)      NULL,
  nome              VARCHAR(200)     NOT NULL,
  email             VARCHAR(200)     NULL,
  tipo_contratacao  ENUM('CLT','PJ') NOT NULL DEFAULT 'CLT',
  -- dados de prestador PJ (usados só quando tipo_contratacao = 'PJ').
  -- PJ é o TIPO de contratação da pessoa (não uma empresa): guarda-se CPF.
  cpf               VARCHAR(20)      NULL,
  telefone          VARCHAR(30)      NULL,
  cargo_id          CHAR(36)         NULL,
  nivel_id          CHAR(36)         NULL,   -- variação de nível DA PESSOA (sobrepõe o padrão do cargo; NULL = herda)
  setor_id          CHAR(36)         NULL,
  local_id          CHAR(36)         NULL,
  regional_id       CHAR(36)         NULL,
  situacao_id       CHAR(36)         NULL,
  lider_id          CHAR(36)         NULL,
  ativo             TINYINT(1)       NOT NULL DEFAULT 1,
  criado_em         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_colab_codigo_dp (codigo_dp),
  KEY ix_colab_cargo (cargo_id),
  KEY ix_colab_setor (setor_id),
  KEY ix_colab_local (local_id),
  KEY ix_colab_regional (regional_id),
  KEY ix_colab_situacao (situacao_id),
  KEY ix_colab_lider (lider_id),
  KEY ix_colab_ativo (ativo),
  CONSTRAINT fk_colab_cargo    FOREIGN KEY (cargo_id)    REFERENCES cargo (id),
  CONSTRAINT fk_colab_nivel    FOREIGN KEY (nivel_id)    REFERENCES nivel_hierarquico (id),
  CONSTRAINT fk_colab_setor    FOREIGN KEY (setor_id)    REFERENCES setor (id),
  CONSTRAINT fk_colab_local    FOREIGN KEY (local_id)    REFERENCES local_trabalho (id),
  CONSTRAINT fk_colab_regional FOREIGN KEY (regional_id) REFERENCES regional (id),
  CONSTRAINT fk_colab_situacao FOREIGN KEY (situacao_id) REFERENCES situacao (id),
  CONSTRAINT fk_colab_lider    FOREIGN KEY (lider_id)    REFERENCES colaborador (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- resolve a dependência circular setor <-> colaborador
ALTER TABLE setor
  ADD CONSTRAINT fk_setor_lider
  FOREIGN KEY (lider_colaborador_id) REFERENCES colaborador (id);

-- ---------------------------------------------------------------------------
-- BLOCO 3 — Histórico e auditoria
-- ---------------------------------------------------------------------------

-- 3.1 colaborador_historico — estado do vínculo ao longo do tempo
CREATE TABLE IF NOT EXISTS colaborador_historico (
  id             CHAR(36)    NOT NULL,
  colaborador_id CHAR(36)    NOT NULL,
  cargo_id       CHAR(36)    NULL,
  setor_id       CHAR(36)    NULL,
  local_id       CHAR(36)    NULL,
  lider_id       CHAR(36)    NULL,
  situacao_id    CHAR(36)    NULL,
  data_inicio    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_fim       DATETIME    NULL,               -- NULL = registro vigente
  motivo         VARCHAR(80) NULL,               -- 'importacao','ajuste_aprovado','inativado'...
  PRIMARY KEY (id),
  KEY ix_hist_colab (colaborador_id),
  KEY ix_hist_vigente (colaborador_id, data_fim),
  CONSTRAINT fk_hist_colab    FOREIGN KEY (colaborador_id) REFERENCES colaborador (id),
  CONSTRAINT fk_hist_cargo    FOREIGN KEY (cargo_id)       REFERENCES cargo (id),
  CONSTRAINT fk_hist_setor    FOREIGN KEY (setor_id)       REFERENCES setor (id),
  CONSTRAINT fk_hist_local    FOREIGN KEY (local_id)       REFERENCES local_trabalho (id),
  CONSTRAINT fk_hist_lider    FOREIGN KEY (lider_id)       REFERENCES colaborador (id),
  CONSTRAINT fk_hist_situacao FOREIGN KEY (situacao_id)    REFERENCES situacao (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3.2 log_auditoria — rastreia cada alteração aplicada no portal
CREATE TABLE IF NOT EXISTS log_auditoria (
  id           CHAR(36)    NOT NULL,
  entidade     VARCHAR(60) NOT NULL,
  registro_id  CHAR(36)    NOT NULL,
  campo        VARCHAR(60) NOT NULL,
  valor_antigo TEXT        NULL,
  valor_novo   TEXT        NULL,
  autor_id     CHAR(36)    NULL,
  data         DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_log_entidade (entidade, registro_id),
  KEY ix_log_autor (autor_id),
  CONSTRAINT fk_log_autor FOREIGN KEY (autor_id) REFERENCES colaborador (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- BLOCO 4 — Processos (importação, solicitações, perfis)
-- ---------------------------------------------------------------------------

-- 4.1 importacao — cabeçalho de cada upload de Excel
CREATE TABLE IF NOT EXISTS importacao (
  id           CHAR(36)     NOT NULL,
  arquivo_nome VARCHAR(255) NOT NULL,
  autor_id     CHAR(36)     NULL,
  data         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status       VARCHAR(30)  NOT NULL DEFAULT 'pendente',  -- pendente/validado/confirmado/erro
  total_linhas INT          NOT NULL DEFAULT 0,
  total_erros  INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_imp_autor (autor_id),
  CONSTRAINT fk_imp_autor FOREIGN KEY (autor_id) REFERENCES colaborador (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4.2 importacao_item — cada linha do arquivo + resultado da validação (prévia)
CREATE TABLE IF NOT EXISTS importacao_item (
  id            CHAR(36)    NOT NULL,
  importacao_id CHAR(36)    NOT NULL,
  linha         INT         NOT NULL,
  payload       JSON        NULL,
  status        VARCHAR(30) NOT NULL DEFAULT 'pendente',  -- ok/erro/alerta
  erros         TEXT        NULL,
  PRIMARY KEY (id),
  KEY ix_impitem_imp (importacao_id),
  CONSTRAINT fk_impitem_imp FOREIGN KEY (importacao_id) REFERENCES importacao (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4.3 solicitacao_ajuste — mudanças estruturais abertas pelo líder, aprovadas pelo RH
CREATE TABLE IF NOT EXISTS solicitacao_ajuste (
  id                  CHAR(36) NOT NULL,
  tipo                ENUM('inclusao','desligamento','mudanca_cargo','mudanca_area','correcao_vinculo','nova_area') NOT NULL,
  solicitante_id      CHAR(36) NULL,
  colaborador_alvo_id CHAR(36) NULL,
  payload             JSON     NULL,
  status              ENUM('pendente','aprovada','devolvida') NOT NULL DEFAULT 'pendente',
  aprovador_id        CHAR(36) NULL,
  data_decisao        DATETIME NULL,
  criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_sol_solic (solicitante_id),
  KEY ix_sol_alvo (colaborador_alvo_id),
  KEY ix_sol_aprov (aprovador_id),
  KEY ix_sol_status (status),
  CONSTRAINT fk_sol_solic FOREIGN KEY (solicitante_id)      REFERENCES colaborador (id),
  CONSTRAINT fk_sol_alvo  FOREIGN KEY (colaborador_alvo_id) REFERENCES colaborador (id),
  CONSTRAINT fk_sol_aprov FOREIGN KEY (aprovador_id)        REFERENCES colaborador (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4.4 usuario_perfil — perfis de acesso (sem colaboradores em geral)
CREATE TABLE IF NOT EXISTS usuario_perfil (
  id             CHAR(36) NOT NULL,
  colaborador_id CHAR(36) NOT NULL,
  perfil         ENUM('LIDER','RH','DIRETORIA') NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_perfil_colab (colaborador_id, perfil),
  CONSTRAINT fk_perfil_colab FOREIGN KEY (colaborador_id) REFERENCES colaborador (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- REGRAS DE INTEGRIDADE (aplicadas na APLICAÇÃO — MySQL 5.7 não impõe CHECK)
-- ============================================================================
--  1. lider_id <> id (ninguém é o próprio líder).
--  2. Sem ciclos: subindo pela cadeia de líderes nunca se retorna ao próprio.
--  3. Raízes permitidas (lider_id NULL): lista fechada — CONFIRMAR seção 8
--     (assumido: apenas Presidente e Conselheiro).
--  4. Coerência de nível: líder deveria ter ordem de nível menor (mais alto)
--     que o subordinado; violação gera ALERTA, não bloqueio.
--  5. Colaborador ativo deve ter situacao_id válida (sem branco).
-- ============================================================================
