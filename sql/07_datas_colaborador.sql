-- ============================================================================
-- Migração 07 — Datas do colaborador (nascimento e admissão) + carga inicial v6
-- ============================================================================
-- O extrato novo do DP (Organograma Institucional v6) traz DATA NASCIMENTO e
-- Data Admissão por colaborador. Colunas novas, alimentadas pela importação.
--
-- Nota de execução (2026-07-17): junto com esta migração foi feita a CARGA
-- INICIAL da base v6 no banco vivo, a pedido do usuário ("começar do zero"):
--   * backup prévio em _bkp_colaborador_20260717, _bkp_colab_hist_20260717 e
--     _bkp_solicitacao_20260717;
--   * apagados: todos os CLT (1592), históricos e logs de auditoria de CLT,
--     todas as solicitações de ajuste e os relatórios de importação antigos;
--   * PRESERVADOS: os 30 colaboradores PJ (geridos pelo menu próprio);
--   * inseridos 1245 CLT do extrato v6 (nome, CPF, datas, cargo, situação,
--     local por código DP) — sem líder/setor/regional/nível: a árvore passa a
--     ser montada dentro do portal (decisão da spec de upload por CPF);
--   * cargos: 9 novos criados; 23 grafias abreviadas do DP mapeadas para os
--     cargos canônicos existentes (ex.: "Analista Depart. Pessoal" →
--     "Analista de Departamento Pessoal") — ver ALIAS na futura rotina de
--     importação;
--   * local novo: "164 - Upside".
-- ============================================================================

ALTER TABLE colaborador
  ADD COLUMN data_nascimento DATE NULL AFTER cpf,
  ADD COLUMN data_admissao   DATE NULL AFTER data_nascimento;
