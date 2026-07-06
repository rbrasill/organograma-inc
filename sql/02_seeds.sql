-- ============================================================================
-- Portal de Organograma — INC Empreendimentos
-- Seeds das listas de referência (MySQL 5.7)
-- ============================================================================
-- ATENÇÃO: os VALORES abaixo são uma PROPOSTA para revisão (perguntas em
-- aberto — CLAUDE.md seção 8). Confirmar com o Rafael antes de rodar:
--   * nivel_hierarquico: ordem e descrições dos níveis.
--   * situacao.ativo_na_arvore: quais situações aparecem no organograma ativo.
--
-- Rodar DEPOIS de 01_schema.sql. Idempotente por nome_normalizado/ordem
-- (INSERT IGNORE evita duplicar se rodar duas vezes).
-- ============================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- nivel_hierarquico  (PROPOSTA — 1 = mais alto)
-- Base: níveis administrativos do "GEM" (Presidente=1, Conselheiro=2, ...)
-- estendidos para cobrir os cargos operacionais/estágio/aprendiz.
-- O mapeamento cargo -> nível será feito na curadoria/importação.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO nivel_hierarquico (id, ordem, descricao) VALUES
  (UUID(), 1,  'Presidente'),
  (UUID(), 2,  'Conselheiro'),
  (UUID(), 3,  'Diretor'),
  (UUID(), 4,  'Gerente'),
  (UUID(), 5,  'Coordenador'),
  (UUID(), 6,  'Analista / Especialista / Desenvolvedor'),
  (UUID(), 7,  'Assistente'),
  (UUID(), 8,  'Auxiliar / Operacional'),
  (UUID(), 9,  'Estágio'),
  (UUID(), 10, 'Aprendiz');

-- ---------------------------------------------------------------------------
-- situacao  (PROPOSTA — ativo_na_arvore = 1 aparece no organograma ativo)
-- Valores observados na base Excel + Inativo/Desligado.
-- PROPOSTA: quem ainda é da empresa aparece; apenas Desligado/Inativo somem.
-- (A Lógica do Produto sugere um corte mais estrito — "apenas ativos e
--  afastados". Ver a pergunta enviada ao Rafael.)
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO situacao (id, nome, nome_normalizado, ativo_na_arvore) VALUES
  (UUID(), 'Ativo',                'ativo',                1),
  (UUID(), 'Afastado',             'afastado',             1),
  (UUID(), 'Férias',               'ferias',               1),
  (UUID(), 'Aviso Prévio',         'aviso previo',         1),
  (UUID(), 'Af. Previdência',      'af. previdencia',      1),
  (UUID(), 'Licença Maternidade',  'licenca maternidade',  1),
  (UUID(), 'Licença',              'licenca',              1),
  (UUID(), 'Inativo',              'inativo',              0),
  (UUID(), 'Desligado',            'desligado',            0);
