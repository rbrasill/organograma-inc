-- 12. Local → Regional: todo local de trabalho pertence a UMA regional, no
--     mesmo molde do vínculo setor→local (mig. 05). Com isso a regional do
--     colaborador passa a SEGUIR o local — quem tem local nunca fica sem
--     regional.
--
--     Backfill seguro: hoje nenhum local tem colaboradores de duas regionais
--     diferentes (verificado na base viva), então cada local herda a regional
--     dos próprios colaboradores; em seguida os colaboradores sem regional
--     herdam a do local. Locais sem nenhum colaborador ativo ficam NULL até
--     o admin definir em Catálogos → Locais.

ALTER TABLE local_trabalho
  ADD COLUMN regional_id CHAR(36) NULL,
  ADD KEY ix_local_regional (regional_id),
  ADD CONSTRAINT fk_local_regional FOREIGN KEY (regional_id) REFERENCES regional (id);

-- cada local herda a regional dos próprios colaboradores ativos (MySQL 5.7,
-- sem window functions — MAX() basta porque não há local com duas regionais)
UPDATE local_trabalho l
  JOIN (
    SELECT local_id, MAX(regional_id) AS regional_id
      FROM colaborador
     WHERE ativo = 1 AND local_id IS NOT NULL AND regional_id IS NOT NULL
     GROUP BY local_id
  ) m ON m.local_id = l.id
   SET l.regional_id = m.regional_id
 WHERE l.regional_id IS NULL;

-- colaboradores com local e sem regional herdam a regional do local
UPDATE colaborador c
  JOIN local_trabalho l ON l.id = c.local_id
   SET c.regional_id = l.regional_id
 WHERE c.regional_id IS NULL AND l.regional_id IS NOT NULL;
