-- ============================================================================
-- Migração da base de teste para a estrutura OFICIAL v2 (MySQL 5.7)
-- Rodar UMA vez no banco já criado. Depois rodar 02_seeds.sql (canônicas v2).
--
-- O que faz:
--   1. Apaga os dados de teste (colaboradores/importações/solicitações) e as
--      listas provisórias — reconstrução do zero, decidida com o RH.
--   2. Evolui o schema para a v2: níveis viram catálogo de FAMÍLIAS
--      (codigo_nh, ordem não-única, variação, família) e os lookups setor/
--      local/situação ganham `codigo_dp` (código oficial do DP), único.
--
-- Nada aqui apaga estrutura de tabela — só dados de teste e colunas/índices
-- substituídos. As tabelas de histórico/auditoria continuam existindo.
-- ============================================================================
SET NAMES utf8mb4;

-- 1) LIMPEZA (ordem segura de FK: filhos → pais) -----------------------------
DELETE FROM importacao_item;
DELETE FROM log_auditoria;
DELETE FROM colaborador_historico;
DELETE FROM solicitacao_ajuste;
DELETE FROM usuario_perfil;
DELETE FROM importacao;
UPDATE setor SET lider_colaborador_id = NULL;   -- quebra setor → colaborador
UPDATE colaborador SET lider_id = NULL;          -- quebra auto-relacionamento
DELETE FROM colaborador;
DELETE FROM cargo;                               -- cargo → nivel_hierarquico
UPDATE setor SET setor_pai_id = NULL;            -- quebra setor → setor
DELETE FROM setor;
DELETE FROM local_trabalho;
DELETE FROM regional;
DELETE FROM situacao;
DELETE FROM nivel_hierarquico;

-- 2) EVOLUÇÃO DO SCHEMA ------------------------------------------------------
-- nivel_hierarquico: de (ordem única + descricao) para catálogo de famílias
ALTER TABLE nivel_hierarquico DROP INDEX uq_nivel_ordem;
ALTER TABLE nivel_hierarquico
  DROP COLUMN descricao,
  ADD COLUMN codigo_nh VARCHAR(20) NULL AFTER id,
  ADD COLUMN variacao  VARCHAR(4)  NULL,
  ADD COLUMN cod_var   VARCHAR(10) NULL,
  ADD COLUMN familia   VARCHAR(120) NULL,
  ADD UNIQUE KEY uq_nivel_nh (codigo_nh),
  ADD KEY ix_nivel_ordem (ordem);

-- códigos oficiais do DP nos lookups (únicos)
ALTER TABLE setor          ADD COLUMN codigo_dp VARCHAR(20) NULL AFTER id, ADD UNIQUE KEY uq_setor_dp (codigo_dp);
ALTER TABLE local_trabalho ADD COLUMN codigo_dp VARCHAR(20) NULL AFTER id, ADD UNIQUE KEY uq_local_dp (codigo_dp);
ALTER TABLE situacao       ADD COLUMN codigo_dp VARCHAR(8)  NULL AFTER id, ADD UNIQUE KEY uq_situacao_dp (codigo_dp);

-- 3) Depois deste arquivo, rodar 02_seeds.sql para popular níveis, situações,
--    setores, locais, regionais e cargos (com nivel_id) canônicos da v2.
