-- Migração 13 — dados pessoais do colaborador (PJ e CLT):
--   * sexo: 'M' (masculino) ou 'F' (feminino); NULL = não informado
--   * pcd: Pessoa com Deficiência — 1 = Sim, 0 = Não; NULL = não informado
--   * quantidade_filhos: inteiro >= 0; NULL = não informado
--   * possui_filhos: DERIVADO de quantidade_filhos (coluna gerada pelo
--     próprio banco — nunca fica inconsistente com a quantidade):
--       quantidade_filhos > 0  → 1 (Sim)
--       quantidade_filhos = 0  → 0 (Não)
--       quantidade_filhos NULL → NULL (não informado)
-- Sexo e PCD entram também pela importação do Excel; filhos é mantido no portal.

ALTER TABLE colaborador
  ADD COLUMN sexo CHAR(1) NULL,
  ADD COLUMN pcd TINYINT(1) NULL,
  ADD COLUMN quantidade_filhos INT NULL,
  ADD COLUMN possui_filhos TINYINT(1)
    GENERATED ALWAYS AS (
      CASE WHEN quantidade_filhos IS NULL THEN NULL
           WHEN quantidade_filhos > 0 THEN 1 ELSE 0 END
    ) STORED,
  ADD CONSTRAINT chk_colab_sexo CHECK (sexo IN ('M', 'F')),
  ADD CONSTRAINT chk_colab_pcd CHECK (pcd IN (0, 1)),
  ADD CONSTRAINT chk_colab_qtd_filhos CHECK (quantidade_filhos >= 0);
