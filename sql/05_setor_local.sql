-- ============================================================================
-- Migração 05 — Vínculo setor → local de trabalho (obra/unidade)
-- ============================================================================
-- Contexto: o novo extrato do DP (arquivo de upload) NÃO traz mais a coluna
-- de setor — mas traz o LOCAL com o código embutido no nome ("219 - Emotion
-- III" ↔ LOCTRA219). Como a taxonomia de setor do DP é "obra/unidade +
-- subdivisão", vinculamos cada setor do catálogo ao seu local: quando o
-- colaborador muda de local na importação e o setor atual dele pertence a
-- OUTRO local, o sistema sabe que o setor está desatualizado (vira pendência
-- para o RH resolver no portal — nunca adivinha o setor novo).
--
-- O vínculo é OPCIONAL (NULL = setor sem local fixo, ex.: áreas corporativas
-- itinerantes). Manutenção pela tela Catálogos → Áreas.
-- ============================================================================

ALTER TABLE setor
  ADD COLUMN local_id CHAR(36) NULL AFTER nome_normalizado,
  ADD KEY ix_setor_local (local_id),
  ADD CONSTRAINT fk_setor_local FOREIGN KEY (local_id) REFERENCES local_trabalho (id);

-- Conferência: setores e seus locais vinculados (recém-criado: tudo NULL)
--   SELECT s.codigo_dp, s.nome, l.nome AS local_vinculado
--     FROM setor s LEFT JOIN local_trabalho l ON l.id = s.local_id
--    ORDER BY s.nome;
