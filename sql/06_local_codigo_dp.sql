-- ============================================================================
-- Migração 06 — Código do local de trabalho passa a ser o NÚMERO oficial do DP
-- ============================================================================
-- Contexto: o novo extrato do DP traz o local como "472 - Reserva JK" — o
-- número do prefixo é o código da obra NO SISTEMA DO DP. A série interna
-- LOCTRA2xx do portal NÃO correspondia a esses números (LOCTRA219="Obra -
-- Emotion III" coincidia com o 219 do DP por acaso; LOCTRA203="Obra - Reserva
-- JK" no DP é 472). Para o matching da importação ser direto e a lista do
-- catálogo ficar igual ao arquivo, o codigo_dp de cada local vira o número
-- real do DP.
--
-- Mapeamento: casado por nome + conferência pela contagem de colaboradores;
-- o caso ambíguo "Unique Solare" (394 e 482 no arquivo) foi resolvido pelas
-- CHAPAS: os colaboradores de "Obra - Unique Sollare II" aparecem no arquivo
-- sob o 482 → 482 = Sollare II, 394 = Sollare.
--
-- Locais sem correspondência no extrato (itinerantes, backoffice regionais,
-- obras encerradas) ficam com codigo_dp = NULL (a UNIQUE aceita múltiplos
-- NULLs) — a importação continua casando esses por nome. "164 - Upside" do
-- arquivo não tem local na base: será criado na primeira importação.
--
-- Sem colisão transitória: todos os códigos antigos têm o prefixo "LOCTRA" e
-- os novos são só dígitos — conjuntos disjuntos durante o UPDATE único.
-- ============================================================================

UPDATE local_trabalho SET codigo_dp = CASE nome_normalizado
  WHEN 'rossi - administrativo backoffice' THEN '37'
  WHEN 'obra - sao pedro life'             THEN '122'
  WHEN 'obra - benfica'                    THEN '127'
  WHEN 'obra - park primavera'             THEN '139'
  WHEN 'obra - central park'               THEN '184'
  WHEN 'obra - karaiba'                    THEN '217'
  WHEN 'obra - emotion iii'                THEN '219'
  WHEN 'obra - emotion 5'                  THEN '226'
  WHEN 'obra - reserva por do sol'         THEN '228'
  WHEN 'obra - paraiso'                    THEN '230'
  WHEN 'obra - park espanha'               THEN '312'
  WHEN 'obra - palestra'                   THEN '365'
  WHEN 'obra - unique palestra'            THEN '367'
  WHEN 'obra - reserva aurora'             THEN '368'
  WHEN 'obra - palestra life'              THEN '374'
  WHEN 'obra - unique sollare'             THEN '394'
  WHEN 'obra - millenium sao jose'         THEN '416'
  WHEN 'obra - life sao jose'              THEN '418'
  WHEN 'obra - felicita sao jose'          THEN '421'
  WHEN 'obra - upside rio preto'           THEN '440'
  WHEN 'obra - upside rio branco'          THEN '465'
  WHEN 'obra - smart garden'               THEN '468'
  WHEN 'obra - reserva andorinhas'         THEN '470'
  WHEN 'obra - reserva jk'                 THEN '472'
  WHEN 'obra - reserva realeza'            THEN '475'
  WHEN 'obra - unique sabia'               THEN '481'
  WHEN 'obra - unique sollare ii'          THEN '482'
  WHEN 'obra - reserva bela vista i'       THEN '484'
  WHEN 'obra - reserva bela vista ii'      THEN '489'
  WHEN 'obra - unique jardins'             THEN '508'
  ELSE NULL
END;

-- Conferência:
--   SELECT codigo_dp, nome FROM local_trabalho ORDER BY CAST(codigo_dp AS UNSIGNED);
--   (30 locais com número do DP · demais com NULL)
