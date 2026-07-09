-- ============================================================================
-- Migração 04 — Re-hierarquização das famílias de nível (spec v3) + cor oficial
-- ============================================================================
-- Origem: tableConvert (familia_nivel_cargos), 44 famílias, NH500–NH543.
--
-- ESTRATÉGIA (segura): a FAMÍLIA é a chave estável. Cada família mantém sua
-- identidade (e, portanto, os cargos/colaboradores que apontam para ela);
-- só mudam seus ATRIBUTOS — ordem (nível), variação, cod_var, código NH e a
-- nova cor oficial. NÃO tocamos em cargo.nivel_id nem colaborador.nivel_id:
-- como atualizamos as linhas existentes casando por família, os ids (UUID)
-- das linhas são preservados e as FKs continuam válidas.
--
-- Por que casar por família e não pelo código NH: os códigos NH foram
-- remanejados entre famílias nesta spec. Sobrescrever por NH re-rotularia
-- cargos silenciosamente (ex.: um cargo "Designer" viraria "Técnico").
--
-- Colisão de UNIQUE(codigo_nh): como os NH são reembaralhados entre famílias,
-- zeramos todos os codigo_nh (NULL) antes de reatribuir, evitando conflito
-- transitório na chave única.
--
-- Collation: a tabela temporária é criada explicitamente em
-- utf8mb4_unicode_ci para casar com nivel_hierarquico.familia (evita o erro
-- 1267 de "illegal mix of collations" no JOIN por família).
--
-- Rode dentro de uma transação e confira os GATES ao final ANTES do COMMIT.
-- ============================================================================

START TRANSACTION;

-- coluna de cor (idempotente: ignore o erro se já existir)
ALTER TABLE nivel_hierarquico ADD COLUMN cor VARCHAR(9) NULL AFTER familia;

-- spec nova em tabela temporária (família = chave de casamento)
DROP TEMPORARY TABLE IF EXISTS _niv_v3;
CREATE TEMPORARY TABLE _niv_v3 (
  familia   VARCHAR(120) NOT NULL,
  ordem     INT          NOT NULL,
  variacao  VARCHAR(4)   NOT NULL,
  cod_var   VARCHAR(10)  NOT NULL,
  codigo_nh VARCHAR(20)  NOT NULL,
  cor       VARCHAR(9)   NOT NULL,
  PRIMARY KEY (familia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO _niv_v3 (familia, ordem, variacao, cod_var, codigo_nh, cor) VALUES
('Presidente',          1,  'A', '1.A',  'NH500', '#D4AF37'),
('Conselheiro',         1,  'A', '1.A',  'NH501', '#C62828'),
('CFO',                 3,  'A', '3.A',  'NH502', '#6A1B9A'),
('Diretor',             4,  'A', '4.A',  'NH503', '#1565C0'),
('Vice-Diretor',        5,  'A', '5.A',  'NH504', '#00897B'),
('Gerente',             6,  'A', '6.A',  'NH505', '#2E7D32'),
('Gestor',              6,  'B', '6.B',  'NH506', '#E91E63'),
('Head',                6,  'C', '6.C',  'NH507', '#9C27B0'),
('Coordenador',         7,  'A', '7.A',  'NH508', '#F57C00'),
('Engenheiro',          8,  'A', '8.A',  'NH509', '#5D4037'),
('Supervisor',          9,  'A', '9.A',  'NH510', '#AD1457'),
('Mestre de Obra',      9,  'B', '9.B',  'NH511', '#673AB7'),
('Encarregado',        10,  'A', '10.A', 'NH512', '#455A64'),
('Advogado',           11,  'A', '11.A', 'NH513', '#7CB342'),
('Arquiteto',          11,  'B', '11.B', 'NH514', '#3F51B5'),
('Desenvolvedor',      11,  'C', '11.C', 'NH515', '#2196F3'),
('Piloto',             11,  'D', '11.D', 'NH516', '#03A9F4'),
('Comprador',          11,  'E', '11.E', 'NH517', '#00BCD4'),
('Designer',           11,  'F', '11.F', 'NH518', '#009688'),
('Analista',           12,  'A', '12.A', 'NH519', '#00ACC1'),
('Técnico',            12,  'B', '12.B', 'NH520', '#4CAF50'),
('Pedreiro',           13,  'A', '13.A', 'NH521', '#8E24AA'),
('Carpinteiro',        13,  'B', '13.B', 'NH522', '#8BC34A'),
('Marceneiro',         13,  'C', '13.C', 'NH523', '#CDDC39'),
('Armador',            13,  'D', '13.D', 'NH524', '#FFC107'),
('Gesseiro',           13,  'E', '13.E', 'NH525', '#FF9800'),
('Pintor',             13,  'F', '13.F', 'NH526', '#FF5722'),
('Encanador',          13,  'G', '13.G', 'NH527', '#795548'),
('Bombeiro Hidráulico',13,  'H', '13.H', 'NH528', '#607D8B'),
('Eletricista',        13,  'I', '13.I', 'NH529', '#F06292'),
('Instalador',         13,  'J', '13.J', 'NH530', '#BA68C8'),
('Operador',           13,  'K', '13.K', 'NH531', '#9575CD'),
('Almoxarife',         13,  'L', '13.L', 'NH532', '#7986CB'),
('Assessor',           13,  'M', '13.M', 'NH533', '#64B5F6'),
('Assistente',         13,  'N', '13.N', 'NH534', '#4FC3F7'),
('Captador',           13,  'O', '13.O', 'NH535', '#4DD0E1'),
('Secretária',         13,  'P', '13.P', 'NH536', '#4DB6AC'),
('Porteiro',           13,  'Q', '13.Q', 'NH537', '#81C784'),
('Sinaleiro',          13,  'R', '13.R', 'NH538', '#AED581'),
('Auxiliar',           14,  'A', '14.A', 'NH539', '#EF6C00'),
('Meio Oficial',       14,  'B', '14.B', 'NH540', '#DCE775'),
('Estagiário',         15,  'A', '15.A', 'NH541', '#3949AB'),
('Servente',           15,  'B', '15.B', 'NH542', '#FFD54F'),
('Aprendiz',           16,  'A', '16.A', 'NH543', '#757575');

-- 1) zera os códigos NH (evita colisão de UNIQUE no reembaralhamento)
UPDATE nivel_hierarquico SET codigo_nh = NULL;

-- 2) aplica a spec nova nas famílias já existentes (id preservado → FKs OK)
UPDATE nivel_hierarquico n
  JOIN _niv_v3 t ON t.familia = n.familia
   SET n.ordem = t.ordem, n.variacao = t.variacao, n.cod_var = t.cod_var,
       n.codigo_nh = t.codigo_nh, n.cor = t.cor;

-- 3) famílias da spec que porventura não existam como linha → insere
INSERT INTO nivel_hierarquico (id, codigo_nh, ordem, variacao, cod_var, familia, cor)
SELECT UUID(), t.codigo_nh, t.ordem, t.variacao, t.cod_var, t.familia, t.cor
  FROM _niv_v3 t
  LEFT JOIN nivel_hierarquico n ON n.familia = t.familia
 WHERE n.id IS NULL;

-- ============================================================================
-- GATES DE VERIFICAÇÃO — rode e confira ANTES do COMMIT:
--
--   -- (a) toda linha ficou com NH? (0 = ok; >0 = família no banco que NÃO
--   --     está na spec v3 — decidir apagar+repontar cargos ou manter)
--   SELECT id, familia FROM nivel_hierarquico WHERE codigo_nh IS NULL;
--
--   -- (b) as 44 famílias da spec casaram? (esperado: 44)
--   SELECT COUNT(*) FROM nivel_hierarquico n JOIN _niv_v3 t ON t.familia=n.familia;
--
--   -- (c) nenhum cargo/colaborador ficou órfão (esperado: 0 e 0)
--   SELECT COUNT(*) FROM cargo WHERE nivel_id IS NOT NULL
--     AND nivel_id NOT IN (SELECT id FROM nivel_hierarquico);
--   SELECT COUNT(*) FROM colaborador WHERE nivel_id IS NOT NULL
--     AND nivel_id NOT IN (SELECT id FROM nivel_hierarquico);
--
--   -- (d) conferência visual do resultado
--   SELECT codigo_nh, ordem, cod_var, familia, cor
--     FROM nivel_hierarquico ORDER BY ordem, variacao;
--
-- Se (a)=vazio, (b)=44, (c)=0/0 → COMMIT;  senão → ROLLBACK; e me chame.
-- ============================================================================

DROP TEMPORARY TABLE IF EXISTS _niv_v3;
-- COMMIT;   -- descomente após validar os gates
