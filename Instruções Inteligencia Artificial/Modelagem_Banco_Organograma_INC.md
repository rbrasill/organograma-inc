Portal de Organograma — Modelagem do Banco 

## **Portal de Organograma — INC Empreendimentos** 

Modelagem do Banco de Dados 

_Documento explicativo (sem DDL) — v1.0_ 06/07/2026 

INC Empreendimentos · v1.0   |   Página 1 

Portal de Organograma — Modelagem do Banco 

## **Sumário** 

INC Empreendimentos · v1.0   |   Página 2 

Portal de Organograma — Modelagem do Banco 

## **1. Visão geral** 

Este documento descreve a modelagem lógica do banco de dados do Portal de Organograma da INC, no nível de tabelas, campos e relações — sem o script SQL, que será produzido em uma etapa posterior. O banco é relacional (MySQL) e é a fonte da verdade do organograma; os dados são consumíveis por API. 

Três princípios orientam o desenho: 

- **Identificador estável:** toda tabela tem chave primária em UUID v4. Códigos do Departamento Pessoal (DP) são guardados como referência externa, nunca como chave. 

- **Listas controladas:** cargo, área/setor, local de trabalho, nível e situação vivem em tabelas de referência (lookup); o colaborador aponta para elas por chave. Isso alimenta os dropdowns e a importação, e elimina texto livre divergente. 

- **Nada se perde:** inativos e alterações não são apagados — vão para histórico (soft delete + trilha de auditoria). 

## **2. Mapa das tabelas** 

O modelo se divide em quatro blocos: 

|**Bloco**|**Tabelas**|
|---|---|
|Referência (lookup)|cargo, nivel_hierarquico, setor (área), local_trabalho, regional, situacao|
|Núcleo|colaborador (com auto-relacionamento de líder)|
|Histórico|colaborador_historico, log_auditoria|
|Processos|importacao, importacao_item, solicitacao_ajuste, usuario_perfil|



**Relação central:** colaborador.lider_id → colaborador.id (auto-relacionamento) forma a árvore; colaborador.cargo_id, setor_id, local_id, regional_id, situacao_id apontam para as listas; cargo.nivel_id aponta para o nível hierárquico. 

## **3. Tabelas de referência (lookup)** 

Regra comum a todas: além do nome de exibição, cada lookup guarda um campo nome_normalizado (sem acento, sem espaços nas pontas, minúsculo) com índice único. A importação e a criação automática comparam por esse campo — assim “TI”, “T.I” e “T.I ” não viram três registros. 

## **3.1 nivel_hierarquico** 

|**Campo**|**Tipo**|**Descrição**|
|---|---|---|
|id|UUID (PK)|Identificador interno.|
|ordem|INT (único)|Posição na hierarquia (1 = mais alto). Ex.: 1 Presidente, 2<br>Conselheiro, 3 CFO, 4 Diretor.|
|descricao|VARCHAR|Nome do nível.|



INC Empreendimentos · v1.0   |   Página 3 

Portal de Organograma — Modelagem do Banco 

## **3.2 cargo** 

|**Campo**|**Tipo**|**Descrição**|
|---|---|---|
|id|UUID (PK)|Identificador próprio do cargo.|
|codigo_cargo_dp|VARCHAR (nulo)|Código do cargo no sistema do DP (referência externa).|
|nome|VARCHAR|Nome do cargo (exibição).|
|nome_normalizado|VARCHAR (único)|Para deduplicar na importação/criação automática.|
|nivel_id|UUID (FK)|→ nivel_hierarquico. Define o nível do cargo.|



## **3.3 setor (área)** 

|**Campo**|**Tipo**|**Descrição**|
|---|---|---|
|id|UUID (PK)|Identificador da área/setor.|
|nome|VARCHAR|Nome do setor (exibição).|
|nome_normalizado|VARCHAR (único)|Deduplicação.|
|setor_pai_id|UUID (FK, nulo)|Preparação para hierarquia de áreas (futuro). Nulo por ora.|
|lider_colaborador_id|UUID (FK, nulo)|Líder responsável pela área. Pode ser derivado (topo da<br>árvore no setor) e validado pelo nível.|



## **3.4 local_trabalho, regional, situacao** 

|**Campo**|**Tipo**|**Descrição**|
|---|---|---|
|local_trabalho|id, nome,<br>nome_normalizado<br>(único)|Filial/unidade onde o colaborador trabalha.|
|regional|id, nome,<br>nome_normalizado<br>(único)|Cidade/região de alocação.|
|situacao|id, nome,<br>ativo_na_arvore<br>(BOOL)|Situações válidas (lista fechada). ‘ativo_na_arvore’ indica<br>se aparece no organograma ativo (ex.: Ativo/Afastado =<br>sim; Desligado/Inativo = não).|



## **4. Tabela núcleo: colaborador** 

Cada linha é uma pessoa (CLT ou PJ). Pode ser subordinada e líder ao mesmo tempo. 

|**Campo**|**Tipo**|**Descrição**|
|---|---|---|
|id|UUID (PK)|Chave interna estável.|
|codigo_dp|VARCHAR (único,<br>nulo)|Código/matrícula do colaborador no DP (referência<br>externa).|
|nome|VARCHAR|Nome completo.|
|email|VARCHAR (nulo)|E-mail corporativo (login/identificação).|
|tipo_contratacao|ENUM('CLT','PJ')|Tipo de vínculo. (Na base atual, inferível pelo prefixo ‘PJ’<br>da matrícula.)|
|cargo_id|UUID (FK)|→ cargo.|



INC Empreendimentos · v1.0   |   Página 4 

Portal de Organograma — Modelagem do Banco 

|**Campo**|**Tipo**|**Descrição**|
|---|---|---|
||||
|setor_id|UUID (FK)|→ setor (área atual).|
|local_id|UUID (FK)|→ local_trabalho.|
|regional_id|UUID (FK, nulo)|→ regional.|
|situacao_id|UUID (FK)|→ situacao.|
|lider_id|UUID (FK, nulo)|→ colaborador.id (líder direto). Nulo apenas para as raízes<br>permitidas.|
|ativo|BOOL|Soft delete: false = arquivado (não aparece no<br>organograma), mas permanece no banco.|
|criado_em / atualizado_em|DATETIME|Timestamps de auditoria.|



## **Regras de integridade (aplicadas na escrita)** 

- Todo colaborador ativo (exceto raiz permitida) tem lider_id preenchido e existente. 

- Sem ciclos: subindo pela cadeia de líderes nunca se retorna ao próprio colaborador. 

- Ninguém é o próprio líder (lider_id ≠ id). 

- Raízes permitidas: lista fechada (ex.: Presidente e Conselheiro). Todo o resto exige líder. 

- Coerência de nível (alerta): o líder deve ter nível superior (ordem menor) ao subordinado; violação é sinalizada como possível erro de vínculo. 

- Situação sem valor em branco (sempre uma FK válida). 

## **5. Histórico e auditoria** 

Sendo o portal a fonte da verdade, nenhuma mudança sobrescreve o passado. 

## **5.1 colaborador_historico** 

Guarda o estado do vínculo ao longo do tempo (mudança de cargo, área, líder, situação, ou arquivamento por inatividade). 

|**Campo**|**Tipo**|**Descrição**|
|---|---|---|
|id|UUID (PK)|Identificador do registro histórico.|
|colaborador_id|UUID (FK)|→ colaborador.|
|cargo_id, setor_id, local_id,<br>lider_id, situacao_id|UUID (FK)|Valores vigentes naquele período.|
|data_inicio / data_fim|DATETIME|Vigência. data_fim nulo = registro atual.|
|motivo|VARCHAR|Ex.: ‘importação’, ‘ajuste aprovado’, ‘inativado’.|



## **5.2 log_auditoria** 

|**Campo**|**Tipo**|**Descrição**|
|---|---|---|
|id|UUID (PK)|Identificador.|



INC Empreendimentos · v1.0   |   Página 5 

Portal de Organograma — Modelagem do Banco 

|**Campo**|**Tipo**|**Descrição**|
|---|---|---|
|entidade / registro_id|VARCHAR / UUID|O que foi alterado (tabela + linha).|
|campo|VARCHAR|Campo alterado.|
|valor_antigo / valor_novo|TEXT|Antes e depois.|
|autor_id|UUID (FK)|Quem alterou.|
|data|DATETIME|Quando.|



## **6. Importação por arquivo (upload)** 

A carga inicial e as atualizações entram por upload de Excel (.xlsx). O JSON fica reservado para integração automática futura (ex.: API do DP). O fluxo é: baixar modelo → subir arquivo → validar/pré-visualizar → confirmar. 

## **6.1 Modo de importação: upsert com arquivamento** 

- **Atualiza** quem já existe (casado por código_dp/matrícula). 

- **Inclui** quem é novo. 

- **Arquiva** quem sumiu do arquivo ou está inativo: ativo = false e registro fechado em colaborador_historico — some do organograma, mas permanece no banco. 

## **6.2 Cargo/área/local novos: criação automática (com normalização)** 

Valores que não existirem nas listas são criados automaticamente. Antes de criar, o sistema normaliza (remove espaços nas pontas, unifica maiúsc./minúsc., remove acentos para comparação) e casa pelo nome_normalizado — assim variações do mesmo valor não geram duplicatas. 

## **6.3 Validação antes de confirmar** 

Nenhum dado entra sem passar pela pré-visualização com erros destacados por linha: 

- Matrícula única (sem duplicatas). 

- Líder existente (por matrícula) e sem ciclo. 

- Nível do líder coerente com o subordinado (alerta). 

- Situação dentro da lista válida. 

- Campos obrigatórios preenchidos. 

## **6.4 Tabelas do processo** 

|**Campo**|**Tipo**|**Descrição**|
|---|---|---|
|importacao|id, arquivo_nome,<br>autor_id, data,<br>status, total_linhas,<br>total_erros|Cabeçalho de cada upload.|



INC Empreendimentos · v1.0   |   Página 6 

Portal de Organograma — Modelagem do Banco 

|**Campo**|**Tipo**|**Descrição**|
|---|---|---|
|importacao_item|id, importacao_id,<br>linha, payload,<br>status, erros|Cada linha do arquivo + resultado da validação (base da<br>prévia).|



## **7. Solicitações de ajuste e perfis** 

## **7.1 solicitacao_ajuste** 

Mudanças estruturais (novo colaborador, desligamento, mudança de cargo/área, correção de vínculo) abertas pelo líder e aprovadas pelo RH (nível único). 

|**Campo**|**Tipo**|**Descrição**|
|---|---|---|
|id|UUID (PK)|Identificador.|
|tipo|ENUM|inclusao, desligamento, mudanca_cargo, mudanca_area,<br>correcao_vinculo, nova_area.|
|solicitante_id|UUID (FK)|→ colaborador (líder).|
|colaborador_alvo_id|UUID (FK, nulo)|Quem é afetado.|
|payload|JSON|Detalhes da mudança proposta.|
|status|ENUM|pendente, aprovada, devolvida.|
|aprovador_id / data_decisao|UUID / DATETIME|RH que decidiu e quando.|



## **7.2 usuario_perfil** 

Perfis de acesso: Líder, RH/DHO (admin) e Diretoria (sem colaboradores em geral). 

|**Campo**|**Tipo**|**Descrição**|
|---|---|---|
|id|UUID (PK)|Identificador.|
|colaborador_id|UUID (FK)|→ colaborador (o usuário).|
|perfil|ENUM('LIDER','RH','<br>DIRETORIA')|Papel de acesso.|
|escopo|—|Líder: só a(s) própria(s) árvore(s). RH/Diretoria: tudo.|



## **8. Ligação com o protótipo** 

O protótipo React já reflete a modelagem: os campos cargo, área, local e situação são dropdowns alimentados por listas (hoje mock, amanhã as tabelas de lookup), e o líder é escolhido por busca sobre os colaboradores. Ao integrar, cada lista vira uma consulta à sua tabela de referência, e salvar/solicitar ajuste grava em colaborador, colaborador_historico, log_auditoria e solicitacao_ajuste, conforme o tipo de mudança. 

## **9. Pendências para a etapa de DDL** 

- Confirmar a lista fechada de raízes permitidas (Presidente e Conselheiro?). 

- Confirmar a lista oficial de situações e, para cada uma, o valor de ‘ativo_na_arvore’. 

INC Empreendimentos · v1.0   |   Página 7 

Portal de Organograma — Modelagem do Banco 

- Definir a tabela de nível por cargo confiável (a da base oficial está inutilizável; a boa cobre só cargos administrativos). 

- Definir a estratégia de autenticação (e-mail corporativo / SSO) para amarrar usuario_perfil ao login. 

- Decidir se a hierarquia de áreas (setor_pai_id) entra já ou fica preparada para depois. 

INC Empreendimentos · v1.0   |   Página 8 

