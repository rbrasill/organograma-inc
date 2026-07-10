Portal de Organograma — INC Empreendimentos 

## **Portal de Organograma — INC Empreendimentos** 

Documento de Lógica do Produto 

_Versão 0.9 — anterior à análise da base em Excel_ 06/07/2026 

Lógica do Produto — v0.9   |   Página 1 

Portal de Organograma — INC Empreendimentos 

## **Sumário** 

Lógica do Produto — v0.9   |   Página 2 

Portal de Organograma — INC Empreendimentos 

## **1. Objetivo e escopo** 

Este documento consolida a lógica do produto do Portal de Organograma da INC Empreendimentos, antes de qualquer definição de design, layout ou interface. O objetivo é servir de base para o desenvolvimento: modelo de dados, regras de negócio, navegação, filtros, perfis de acesso, fluxo de validação e roadmap. 

O portal permite visualizar a estrutura da empresa por área e por liderança, e permite que líderes mantenham a estrutura sob sua responsabilidade atualizada. O portal passa a ser a fonte da verdade do organograma, com backend em banco relacional (MySQL) e dados consumíveis via API. 

**Público-alvo do portal:** líderes, RH/DHO e diretoria. Colaboradores em geral não têm acesso nesta concepção — trata-se de uma ferramenta de gestão e governança da estrutura, não de um diretório público. 

## **2. Decisões já tomadas** 

As definições abaixo já foram validadas e orientam todo o restante do documento. 

|**Tema**|**Decisão**|
|---|---|
|Fonte da verdade|O portal passa a ser a fonte da verdade. O Excel é carga inicial; o backend é<br>MySQL, consumível por API.|
|Identificadores|Chave primária interna em UUID v4. Códigos do Departamento Pessoal (DP)<br>são guardados como referência externa, nunca como chave.|
|Modelo de dados|Híbrido/preparado: começa centrado na pessoa (pessoa → líder direto), com o<br>esquema já pronto para receber uma camada de posições/vagas no futuro.|
|Navegação/filtros|Dois caminhos principais: por área e por liderança.|
|Hierarquia|Árvore pura: cada colaborador tem exatamente um líder direto (sem multi-<br>gestor por ora).|
|Líder multi-área|Suportado naturalmente: subordinados de setores diferentes apontam para o<br>mesmo líder.|
|Edição x aprovação|Líder edita direto (com auditoria) dentro do seu escopo; RH aprova (nível único)<br>mudanças estruturais ou que cruzam escopo.|
|Situação na árvore|O organograma ativo mostra apenas ativos e afastados; desligados/inativos<br>ficam no histórico.|
|Contratação|CLT e PJ entram no organograma em igualdade; líder também é sempre um<br>colaborador cadastrado.|



## **3. Como a base em Excel deve ser interpretada** 

A base atual é o ponto de partida. Cada linha representa um colaborador. Na carga inicial, cada linha vira um registro de colaborador com UUID próprio; os campos de líder e de cargo passam a apontar para outros registros por identificador, e não por nome. 

Lógica do Produto — v0.9   |   Página 3 

Portal de Organograma — INC Empreendimentos 

Princípio central: separar identificador de exibição. Nome do colaborador e nome do líder são texto de exibição e podem repetir ou mudar; a ligação hierárquica e a de cargo devem ser feitas por chave estável (matrícula/UUID). O campo “Nome do Líder” é derivado por relação, não armazenado como verdade independente. 

## **Mapeamento dos campos informados** 

|**Campo na base**|**Papel no modelo**|**Observações**|
|---|---|---|
|Código do colaborador (DP)|Referência externa em Colaborador|Guardado, mas não é a chave.<br>Chave = UUID.|
|Regional|Atributo do colaborador (tabela de<br>apoio)|Cidade/região de alocação atual.|
|Nome do colaborador|Atributo do colaborador|Texto de exibição.|
|Cargo|FK para tabela Cargo|Cargo tem UUID próprio + código do<br>DP.|
|Setor|FK para tabela Setor (área)|Base do filtro por área.|
|Código do cargo (DP)|Referência externa em Cargo|Complementado por UUID próprio<br>do cargo.|
|Nível hierárquico do cargo|FK para tabela Nível Hierárquico|Ex.: Presidente=1, Conselheiro=2,<br>CFO=3.|
|Matrícula do líder|FK (auto-relacionamento) para<br>Colaborador|Define a árvore. Líder é sempre<br>colaborador.|
|Nome do líder|Derivado (join)|Não armazenar como campo<br>independente.|
|Situação|Atributo/estado do colaborador|Ativo, Inativo, Afastado, Desligado.|
|Local de trabalho|Atributo do colaborador|Filial/escritório/unidade.|



**A confirmar com o Excel real:** se existe matrícula/ID único por pessoa; se a coluna “reporta para”/matrícula do líder já vem preenchida; se as áreas têm hierarquia entre si; se o cargo é texto livre ou padronizado; e como se define operacionalmente quem é “líder” de uma área. 

## **4. Modelo de dados** 

O modelo é normalizado e centrado na pessoa, com tabelas de apoio para evitar texto repetido e permitir validação. Todas as chaves primárias são UUID v4. 

## **Entidades principais** 

|**Entidade**|**Descrição**|**Campos-chave**|
|---|---|---|
|Colaborador|Pessoa cadastrada (CLT ou PJ). Pode<br>ser subordinado e líder ao mesmo<br>tempo.|id (UUID), codigo_dp, nome, email,<br>tipo_contratacao, situacao, cargo_id,<br>setor_id, regional_id, local_trabalho_id,<br>lider_id (self-FK)|
|Cargo|Cargo/função, com identificação<br>própria e vínculo a um nível.|id (UUID), codigo_cargo_dp, nome,<br>nivel_hierarquico_id|



Lógica do Produto — v0.9   |   Página 4 

Portal de Organograma — INC Empreendimentos 

|**Entidade**|**Descrição**|**Campos-chave**|
|---|---|---|
|Nível Hierárquico|Ordena os cargos na estrutura (menor<br>número = mais alto).|id, ordem, descricao (ex.: 1 Presidente, 2<br>Conselheiro, 3 CFO)|
|Setor / Área|Área organizacional; base do filtro por<br>área.|id (UUID), nome, (opcional) setor_pai_id,<br>lider_setor_id|
|Regional / Local|Tabelas de apoio de localização.|id, nome|
|Histórico de alocação|Registra cada vínculo<br>pessoa↔cargo↔setor↔líder ao longo<br>do tempo.|id, colaborador_id, cargo_id, setor_id,<br>lider_id, data_inicio, data_fim|
|Log de auditoria|Rastreia toda alteração aplicada no<br>portal.|id, entidade, registro_id, campo,<br>valor_antigo, valor_novo, autor_id, data|
|Solicitação de<br>alteração|Fila de mudanças estruturais que<br>dependem de aprovação do RH.|id, tipo, solicitante_id, payload, status,<br>aprovador_id, data|



## **Relações essenciais** 

- Colaborador.lider_id → Colaborador.id (auto-relacionamento) define a árvore hierárquica. 

- Colaborador.cargo_id → Cargo.id; Cargo.nivel_hierarquico_id → Nível Hierárquico.id. 

- Colaborador.setor_id → Setor.id; um líder que atende vários setores é identificado por ter subordinados em setores distintos e/ou por ser líder de mais de um setor. 

- Toda alteração fecha o registro corrente no Histórico e abre um novo — nunca sobrescreve o passado. 

**Preparação para posições/vagas (futuro):** no híbrido, cargo e setor ficam em tabelas próprias justamente para que, mais adiante, se possa inserir uma tabela Posição (cargo + setor + posição superior + status ocupada/vaga) sem reescrever o núcleo. Enquanto isso não acontece, não há representação de cadeira vaga. 

## **5. Regras de negócio** 

## **Integridade da hierarquia** 

- Todo colaborador, exceto o topo, tem exatamente um líder direto; o topo tem líder vazio. 

- Não pode existir ciclo hierárquico (A reporta a B que reporta a A, direta ou indiretamente). 

- O líder deve existir como colaborador cadastrado e, preferencialmente, ter nível hierárquico superior (ordem menor) ao do subordinado — violação é sinalizada como possível erro de vínculo. 

- Desligar um colaborador que possui subordinados exige realocar os subordinados antes, para não quebrar a árvore. 

## **Cadastro e contratação** 

- CLT e PJ participam do organograma em igualdade de condições. 

Lógica do Produto — v0.9   |   Página 5 

Portal de Organograma — INC Empreendimentos 

- Cada cargo tem identificação própria (UUID) além do código do DP, e está associado a um nível hierárquico. 

- Os códigos do DP são preservados, mas o sistema não depende exclusivamente deles. 

## **Estado e histórico** 

- O organograma ativo considera apenas colaboradores Ativos e Afastados; Desligados e Inativos permanecem apenas no histórico. 

- Mudança de área, cargo ou líder gera novo registro histórico e entrada no log de auditoria. 

## **6. Navegação e filtros** 

A navegação opera sobre a mesma base por dois caminhos complementares, sem duplicar dados. 

## **Caminhos de navegação** 

1. Por área: seleciona um setor e vê o líder responsável e os subordinados daquele setor; a partir de qualquer pessoa é possível descer na sub-árvore. 

2. Por liderança: escolhe um líder e vê tudo o que está sob ele, inclusive quando abrange mais de um setor. 

3. Busca por pessoa (apoio): localiza um colaborador e mostra o contexto — cargo, setor, líder e subordinados. 

## **Filtros úteis** 

- Área/Setor e Liderança (principais). 

- Situação (ativos/afastados por padrão). 

- Regional e Local de trabalho. 

- Tipo de contratação (CLT/PJ). 

- Nível hierárquico do cargo. 

**Observação:** este item trata da lógica de navegação, não do layout. A forma visual de exibir o organograma será definida em etapa posterior, conforme sua orientação. 

## **7. Líderes que gerenciam mais de uma área** 

No modelo centrado na pessoa, um líder que responde por várias áreas não gera duplicidade: a mesma pessoa é apontada como líder por subordinados de setores diferentes e/ou é registrada como responsável por mais de um setor. 

- A pessoa aparece uma única vez, com um único cargo e nível. 

- A visão “por liderança” reúne todos os subordinados dele, agrupando por setor. 

- A visão “por área” mostra o mesmo líder no topo de cada setor sob sua responsabilidade. 

Lógica do Produto — v0.9   |   Página 6 

Portal de Organograma — INC Empreendimentos 

## **8. Fluxo de validação pelo líder** 

A validação é o mecanismo pelo qual a estrutura se mantém correta ao longo do tempo. O líder revisa a estrutura sob sua responsabilidade e mantém-na atualizada. O nível de autonomia depende do impacto da mudança. 

## **O que o líder faz direto (aplica na hora, com auditoria)** 

- Atualizar dados da pessoa dentro da sua árvore. 

- Corrigir cargo dentro de estrutura já existente. 

- Confirmar que a estrutura está correta (“validado em DD/MM”). 

- Sinalizar afastamento/retorno dentro da própria área. 

## **O que passa por aprovação do RH (nível único)** 

- Incluir novo colaborador na estrutura. 

- Desligar alguém. 

- Mudança de área/setor que envolve outro líder. 

- Correção de vínculo hierárquico que muda quem reporta a quem entre árvores diferentes. 

- Criação de novo setor/área. 

## **Fluxo típico da mudança estrutural:** 

4. Líder abre uma solicitação (tipo: inclusão, desligamento, mudança de cargo, mudança de área, correção de vínculo). 

5. A solicitação entra numa fila com status Pendente. 

6. RH/DHO revisa, aprova ou devolve com observação. 

7. Ao aprovar, a mudança é aplicada, o histórico é atualizado e o log de auditoria registra autor e data. 

**Ponto em aberto:** se preferir que o líder aplique tudo direto e o RH apenas revise depois pelo log, a etapa de aprovação vira revisão posterior. A concepção atual mantém a aprovação prévia para o que é estrutural. 

## **9. Perfis e permissões** 

Três perfis, sem acesso de colaboradores em geral nesta versão. 

|**Perfil**|**Visualização**|**Edição**|**Aprovação**|
|---|---|---|---|
|Líder|A(s) sua(s) árvore(s)|Direta na própria árvore (com<br>auditoria); abre solicitações<br>estruturais|Não|
|RH / DHO (admin)|Tudo|Tudo; gerencia a base, cargos,<br>níveis e setores|Aprova<br>solicitações<br>estruturais|
|Diretoria|Visão ampla (toda a estrutura);|Conforme definição (por padrão,|Opcional,|



Lógica do Produto — v0.9   |   Página 7 

Portal de Organograma — INC Empreendimentos 

|**Perfil**|**Visualização**|**Edição**|**Aprovação**|
|---|---|---|---|
||campos de gestão como<br>headcount quando aplicável|leitura ampla)|conforme<br>política|



- Escopo do líder = apenas os colaboradores da(s) sua(s) árvore(s). 

- A autenticação precisa identificar o líder logado para aplicar o escopo — provável login por e-mail corporativo/SSO (a definir). 

## **10. Funcionalidades por versão** 

## **Núcleo lógico mínimo (primeira entrega)** 

- Modelo de dados normalizado em MySQL, com UUIDs e códigos do DP preservados. 

- Carga inicial a partir do Excel, com validação de integridade (ciclos, líder inexistente, nível incoerente). 

- Navegação por área e por liderança + busca por pessoa. 

- Filtros de situação, área, liderança, regional, contratação e nível. 

- Edição direta pelo líder com log de auditoria. 

- Fila de solicitações estruturais com aprovação do RH (nível único). 

- Controle de perfis (Líder, RH/DHO, Diretoria) e escopo por líder. 

_Observação: o formato visual do organograma (layout/experiência) será definido em etapa posterior; aqui está apenas a lógica._ 

## **Versões futuras** 

- Camada de posições/vagas (cadeiras ocupadas ou vagas) e visão de headcount. 

- Hierarquia entre áreas (diretoria → gerência → coordenação), se aplicável. 

- Notificações (e-mail/portal) para solicitações e prazos de validação. 

- API pública/integrações com outros sistemas e com o DP. 

- Relatórios e exportações (headcount por área, vínculos pendentes de validação). 

- Fotos, senioridade, data de admissão e outros campos de enriquecimento. 

## **11. Dúvidas em aberto** 

## **Resolvidas com o Excel:** 

- Existe matrícula/ID único por pessoa na base atual? 

- A hierarquia (matrícula do líder) já vem preenchida ou é inferida? 

- As áreas têm hierarquia entre si ou são uma lista plana? 

- Cargo é texto livre ou tabela padronizada? 

- Como se define operacionalmente quem é o “líder” de uma área? 

## **Dependem de decisão sua:** 

- Autenticação: login por e-mail corporativo/SSO? 

Lógica do Produto — v0.9   |   Página 8 

Portal de Organograma — INC Empreendimentos 

- Aprovação estrutural: prévia (concepção atual) ou revisão posterior pelo log? 

- Diretoria: enxerga campos sensíveis (ex.: headcount, vagas) além do organograma? 

- O portal deve, desde já, prever a camada de posições/vagas ou só deixá-la preparada? 

Lógica do Produto — v0.9   |   Página 9 

