-- ============================================================================
-- Migração 09 — Perfis de acesso (fase 2 do login por CPF)
-- ============================================================================
-- Quatro níveis de acesso:
--   (sem linha)   = PADRÃO      → só visualiza o organograma (default de todos;
--                                 quem está no padrão NÃO aparece na tela de
--                                 gerenciar acessos)
--   'COLABORADOR' = nível 1     → + baixar imagem, ver Líderes por Área,
--                                 solicitar ajuste ao RH
--   'GESTOR'      = nível 2     → + exportar Excel (nada de edição)
--   'ADMIN'       = nível 3     → acesso completo
--
-- A tabela usuario_perfil (schema original: LIDER/RH/DIRETORIA, nunca usada e
-- vazia) é re-tipada para os perfis novos, com UM perfil por colaborador.
-- O perfil entra como claim na sessão no LOGIN — mudanças valem a partir do
-- próximo login do usuário.
--
-- Admin inicial: Rafael Brasil de Lima (CPF 096.482.726-38). O INSERT abaixo
-- depende de o colaborador já existir na base (importação do extrato do DP);
-- se rodar antes da importação, re-executar depois. Rede de segurança extra:
-- a env ACESSO_ADMIN_CPFS (lista de CPFs separados por vírgula) garante perfil
-- ADMIN no login mesmo sem linha nesta tabela — evita lock-out.
-- ============================================================================

ALTER TABLE usuario_perfil
  MODIFY perfil ENUM('COLABORADOR','GESTOR','ADMIN') NOT NULL;

-- um perfil por colaborador (era UNIQUE(colaborador_id, perfil))
ALTER TABLE usuario_perfil
  DROP KEY uq_perfil_colab,
  ADD UNIQUE KEY uq_perfil_colab (colaborador_id);

-- admin inicial (idempotente; re-executável após a importação)
INSERT INTO usuario_perfil (id, colaborador_id, perfil)
SELECT UUID(), id, 'ADMIN'
  FROM colaborador
 WHERE cpf = '09648272638' AND ativo = 1
 ORDER BY data_admissao DESC
 LIMIT 1
ON DUPLICATE KEY UPDATE perfil = 'ADMIN';
