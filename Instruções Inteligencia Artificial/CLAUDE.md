# Portal de Organograma — INC Empreendimentos

> **Arquivo de contexto para IA (Claude Code).** Leia este documento inteiro antes de agir.
> Ele descreve o status real do projeto, as decisões já tomadas e o que falta. **Não invente**
> requisitos, campos ou regras que não estejam aqui. Em caso de dúvida, pergunte ao usuário
> (Rafael) em vez de assumir. Este projeto foi iniciado no Cowork (Claude Desktop) e está sendo
> continuado no Claude Code para a etapa de banco de dados.

---

## 0. TL;DR (o essencial em 10 linhas)

- **Produto:** portal web para visualizar o organograma da INC por área/liderança e permitir que líderes validem/solicitem ajustes na sua estrutura.
- **Fonte da verdade:** o portal (banco relacional **MySQL**), não mais o Excel. Excel/JSON são só carga.
- **Protótipo pronto:** app **Next.js (App Router)** nesta pasta (`portal_org_inc`), com dados **mock** da área de TI. Build validado, deploy testado na Vercel.
- **Modelagem do banco:** já **desenhada** (documento em `../Modelagem_Banco_Organograma_INC.docx`), mas **ainda NÃO existe DDL nem tabelas criadas**.
- **Banco real:** MySQL `rentis39_organograma_inc` (versão 5.7.44), acessível via conector (funcionou na versão web do Claude; falhou no Cowork — por isso a etapa de banco migrou para cá).
- **Próximo passo imediato:** gerar o **DDL (CREATE TABLE)** conforme a modelagem da seção 6 e criar o schema no banco. Depois, a importação por Excel (upsert).
- **Regra de ouro:** hierarquia é uma **árvore** (cada colaborador tem 1 líder; sem ciclos). Listas (cargo/área/local/nível/situação) são **tabelas de referência**, não texto livre.

---

## 1. Visão do produto

Portal onde **líderes, RH/DHO e diretoria** (NÃO os colaboradores em geral) visualizam o organograma
por **área** e por **liderança**, e onde o líder **valida** se a estrutura da sua área está correta ou
**solicita ajustes** (incluir pessoa, desligar, mudar cargo, mudar de área, corrigir vínculo).

É uma **ferramenta de gestão/governança da estrutura**, não um diretório público de funcionários.

### Perfis de acesso
| Perfil | Vê | Edita | Aprova |
|---|---|---|---|
| **Líder** | sua(s) árvore(s) | edição direta na própria árvore (com auditoria); abre solicitações estruturais | não |
| **RH / DHO (admin)** | tudo | tudo; gerencia base, listas e importações | aprova solicitações estruturais |
| **Diretoria** | tudo (visão ampla) | leitura ampla (config.) | opcional |

---

## 2. Decisões já tomadas (NÃO reabrir sem confirmar com o usuário)

1. **Fonte da verdade = portal/MySQL.** Excel é carga inicial; JSON reservado p/ integração futura (API do DP).
2. **Chave primária interna = UUID v4.** Códigos do Departamento Pessoal (DP) são **referência externa**, nunca a chave.
3. **Modelo de dados: híbrido/centrado na pessoa.** Começa centrado na pessoa (pessoa → líder direto). Preparado para, no futuro, ganhar camada de "posições/vagas" — mas **por ora NÃO há posições/cadeiras vagas**.
4. **Hierarquia = árvore pura.** Cada colaborador tem **exatamente 1 líder direto**. Sem multi-gestor (matricial) por enquanto.
5. **Raízes (sem líder):** apenas **Presidente e Conselheiro** (donos) podem ficar sem líder. Todo o resto tem líder obrigatório. (⚠️ confirmar com o usuário antes de gravar no DDL — ver seção 8.)
6. **Sem ciclos** e **ninguém é o próprio líder**. Desligar quem tem subordinados exige realocar antes.
7. **Líder de uma área** = a pessoa que, dentro daquela área, não responde a ninguém de dentro da mesma área (topo da subárvore no setor). O **nível hierárquico** entra como **validação/desempate** (o topo por árvore deveria ser também o de maior nível; se não for, gera alerta).
8. **Líder multi-área** é suportado naturalmente: subordinados de setores diferentes apontam para o mesmo líder.
9. **Situação** vira **lista fechada** no banco, cada valor com flag `ativo_na_arvore` (aparece ou não no organograma ativo). Nada de campo em branco.
10. **Cargo, Área/Setor, Local de trabalho, Nível, Situação = listas do banco (lookup).** No portal são dropdowns; o líder é escolhido por busca. Isso elimina texto livre divergente.
11. **Filtros/navegação:** por **área** e por **liderança**, + busca por pessoa (autocomplete, pois há homônimos).
12. **Edição x aprovação:** o **líder edita direto** (com auditoria) o que não muda a estrutura (dados da pessoa, local, e-mail). Mudanças **estruturais** (cargo, área, líder, desligamento, nova área) passam por **solicitação → aprovação do RH (nível único)**.
13. **Importação por upload de Excel (.xlsx)**, modo **UPSERT + arquivamento**:
    - Atualiza quem já existe (casado por matrícula/`codigo_dp`).
    - Inclui quem é novo.
    - Quem sumiu do arquivo ou está inativo → **soft delete** (`ativo=false`) + registro em histórico. **Nunca apagar de fato.**
14. **Cargo/área/local novos no arquivo = criados automaticamente**, MAS com **normalização** antes de comparar (remover espaços nas pontas, unificar caixa e acentos) e casar por `nome_normalizado` — para não repoluir as listas (ex.: "TI", "T.I", "T.I " devem virar 1 registro só).
15. **Organograma na tela: sem rolagem lateral.** Resolvido com (a) subordinados-folha em grade que quebra em linhas e (b) "fit-to-width" (zoom automático).
16. **Cores/UI:** linhas do organograma em laranja INC suavizado (`--wire:#ff9a70`, base `#ff530f`). Marca INC azul `#1f3864`. Bolinha de cor por **nível hierárquico** (mantida) + legenda. **Tag "PJ" foi removida** dos cards. Sem foto — ícone de usuário.
17. **Layout ainda NÃO foi aprovado** como definitivo — é protótipo para validar lógica/experiência.

---

## 3. Estado atual — o que já foi feito

- ✅ Documento de **lógica do produto** (`../Logica_Portal_Organograma_INC.docx`).
- ✅ **Análise da base Excel** real (ver seção 5) com achados de inconsistência.
- ✅ **Protótipo React/Next.js** nesta pasta, com dados mock de TI, build validado, deploy Vercel testado.
- ✅ Funcionalidades no protótipo: navegação em árvore recursiva, autocomplete de busca, alerta de inconsistência (triângulo), **modal de edição** com dropdowns (cargo/área/local/situação) + busca de líder + botão "Solicitar ajuste", fit-to-width.
- ✅ Documento de **modelagem do banco** (`../Modelagem_Banco_Organograma_INC.docx`).
- ✅ Conexão ao MySQL confirmada (na versão web): banco `rentis39_organograma_inc`, MySQL 5.7.44.

## 3.1 O que FALTA (próximos passos, em ordem)

1. **Gerar o DDL** (CREATE TABLE) do schema conforme a seção 6 e criar as tabelas no banco `rentis39_organograma_inc`.
2. **Seeds** das listas: níveis, situações, e cargos/áreas/locais (podem ser extraídos da base Excel).
3. **Rotina de importação por Excel** (upsert + arquivamento + normalização + validação com prévia de erros).
4. **API** (camada de leitura/escrita) para o front consumir (substituir os mocks do protótipo).
5. **Autenticação** (definir: login por e-mail corporativo/SSO) e amarração aos perfis.
6. Integrar o protótipo React ao banco real (trocar `data/ti.js` mock por chamadas de API).

---

## 4. Stack e estrutura do protótipo (esta pasta)

**Stack:** Next.js 14 (App Router), React 18, JavaScript (sem TypeScript), CSS puro (sem Tailwind).
Fonte via `@import` no CSS (não usar `next/font/google` — quebra o build sem acesso à internet no build).

```
portal_org_inc/
├─ app/
│  ├─ layout.js        # layout raiz (sem next/font; body simples)
│  ├─ page.js          # renderiza <OrgChart />
│  └─ globals.css      # todos os estilos (variáveis de cor INC, árvore, modal, etc.)
├─ components/
│  ├─ OrgChart.jsx     # componente principal (client): árvore recursiva, busca, fit-to-width, estado
│  ├─ PersonModal.jsx  # modal de edição/solicitação com dropdowns e busca de líder
│  └─ icons.jsx        # ícones SVG inline (sem libs de ícone)
├─ data/
│  └─ ti.js            # DADOS MOCK (área de TI) + listas mock + helpers (árvore, normalização, níveis)
├─ package.json  next.config.mjs  jsconfig.json (alias @/)  .gitignore  README.md
```

**Como rodar:** `npm install && npm run dev` → http://localhost:3000. Deploy: Vercel detecta Next.js automaticamente, sem env vars.

**⚠️ Importante sobre os dados do protótipo:** `data/ti.js` é **mock** de UMA área (TI) para validar layout/lógica.
Os campos do mock (`id, nome, cargo, local, situacao, lider, pj`) são um subconjunto simplificado do
modelo real do banco (seção 6). Ao integrar, substituir por dados vindos da API.

**Nota de ambiente (Cowork):** a gravação de arquivos grandes nesta pasta (sincronizada via OneDrive)
estava truncando via ferramentas de escrita; no Claude Code local isso não deve ocorrer. Ainda assim,
após editar `OrgChart.jsx` ou `globals.css`, confira se o arquivo fecha corretamente (build valida).

---

## 5. A base de dados real (Excel) — o que sabemos

**Arquivo oficial:** `../Organograma Institucional v1.xlsx` (aba `Sheet1`), 1.624 linhas, 1 linha = 1 colaborador.
(Existem 2 planilhas antigas na pasta: `ORGANOGRAMA 29.06 - Atualizado.xlsx` e `Organograma GEN Não Oficcial.xlsx` — esta última tem uma aba `nivel hierarquia` com níveis por cargo, mas só cobre cargos administrativos.)

### Colunas do arquivo oficial (na ordem)
1. `Cod. Colaborador sistema do Departamento Pessoal` — matrícula/chapa (ex.: `015351`; PJs usam `PJ1008`)
2. `Regional` — cidade/região (6 valores + vazios)
3. `Nome Colaborador`
4. `Cargo`
5. `Setor` — a **área** (40 setores; "Obra" concentra ~82% = 1.333 pessoas)
6. `Cod. Cargo` — código do cargo no DP
7. `Cod. Nivel Hierar. Cargo` — **⚠️ INUTILIZÁVEL** (valores 1–30 aleatórios; o mesmo cargo aparece com todos os níveis). NÃO usar como nível hierárquico.
8. `Matricula Lider` — matrícula do líder direto (é o que forma a árvore)
9. `Nome Lider` — redundante (deve ser derivado por join, não armazenado como verdade)
10. `Situação Colaborador` — 11 valores (Ativo, Afastado, Férias, Aviso Prévio, Af.Previdência, Licença Mater., etc.) + 29 vazios
11. `Local de Trabalho` — filial/unidade

### Achados de qualidade (a corrigir na carga — não são bug do modelo)
- **1 chapa duplicada:** `014869` (Richard Barros, linha idêntica 2×).
- **1 auto-liderança:** `016634` é líder de si mesmo.
- **1 ciclo mútuo:** `010385` (Caio) e `010382` (Letícia) são líderes um do outro.
- **Líder como texto:** `012006` e `012007` têm o texto "Diretor Geral" no campo matrícula do líder (deveria ser vazio — são o topo, os donos Ednilson e Neylson).
- **12 PJs sem líder** (`PJ1001…PJ1031`), cargo e situação vazios — precisam ser encaixados.
- **Não há coluna CLT/PJ** — inferível pelo prefixo `PJ` na matrícula.
- O **nível hierárquico real** precisa de uma tabela confiável por cargo (a do arquivo oficial é lixo; a do GEM cobre só administrativos: Presidente=1, Conselheiro=2, CFO=3, Diretor=4...).

> O usuário disse que **essas inconsistências serão corrigidas já no banco** (não precisa tratar no Excel).
> A importação deve **detectar e reportar** essas inconsistências (prévia com erros), não silenciá-las.

---

## 6. Modelagem do banco (o que gerar o DDL a partir daqui)

Banco: **MySQL** (`rentis39_organograma_inc`). Todas as PKs em **UUID v4** (CHAR(36) ou BINARY(16) — sugerir CHAR(36) por legibilidade). Regra transversal: cada tabela de lookup tem `nome` (exibição) + `nome_normalizado` (único, para dedup).

### 6.1 Tabelas de referência (lookup)
- **nivel_hierarquico** — `id (PK)`, `ordem INT UNIQUE` (1 = mais alto), `descricao`.
- **cargo** — `id (PK)`, `codigo_cargo_dp` (nulo), `nome`, `nome_normalizado (UNIQUE)`, `nivel_id (FK→nivel_hierarquico)`.
- **setor** (área) — `id (PK)`, `nome`, `nome_normalizado (UNIQUE)`, `setor_pai_id (FK→setor, nulo — preparação p/ hierarquia de áreas, não usar ainda)`, `lider_colaborador_id (FK→colaborador, nulo)`.
- **local_trabalho** — `id (PK)`, `nome`, `nome_normalizado (UNIQUE)`.
- **regional** — `id (PK)`, `nome`, `nome_normalizado (UNIQUE)`.
- **situacao** — `id (PK)`, `nome`, `nome_normalizado (UNIQUE)`, `ativo_na_arvore BOOL`.

### 6.2 Tabela núcleo
- **colaborador**
  - `id (PK, UUID)`
  - `codigo_dp VARCHAR UNIQUE` (nulo) — matrícula/chapa do DP
  - `nome`, `email` (nulo)
  - `tipo_contratacao ENUM('CLT','PJ')`
  - `cargo_id (FK→cargo)`, `setor_id (FK→setor)`, `local_id (FK→local_trabalho)`, `regional_id (FK→regional, nulo)`, `situacao_id (FK→situacao)`
  - `lider_id (FK→colaborador, nulo)` — auto-relacionamento; nulo só para raízes permitidas
  - `ativo BOOL` — soft delete (false = arquivado, some do organograma mas fica no banco)
  - `criado_em`, `atualizado_em DATETIME`
  - **Regras (aplicar via app/trigger/validação):** sem ciclo; `lider_id != id`; nível do líder deveria ser superior (alerta); raiz só Presidente/Conselheiro.

### 6.3 Histórico e auditoria
- **colaborador_historico** — `id (PK)`, `colaborador_id (FK)`, `cargo_id`, `setor_id`, `local_id`, `lider_id`, `situacao_id`, `data_inicio`, `data_fim (nulo=atual)`, `motivo` (ex.: 'importacao', 'ajuste_aprovado', 'inativado').
- **log_auditoria** — `id (PK)`, `entidade`, `registro_id`, `campo`, `valor_antigo TEXT`, `valor_novo TEXT`, `autor_id (FK→colaborador)`, `data`.

### 6.4 Processos
- **importacao** — `id (PK)`, `arquivo_nome`, `autor_id (FK)`, `data`, `status`, `total_linhas`, `total_erros`.
- **importacao_item** — `id (PK)`, `importacao_id (FK)`, `linha INT`, `payload JSON`, `status`, `erros TEXT` (base da prévia/validação).
- **solicitacao_ajuste** — `id (PK)`, `tipo ENUM('inclusao','desligamento','mudanca_cargo','mudanca_area','correcao_vinculo','nova_area')`, `solicitante_id (FK)`, `colaborador_alvo_id (FK, nulo)`, `payload JSON`, `status ENUM('pendente','aprovada','devolvida')`, `aprovador_id (FK, nulo)`, `data_decisao (nulo)`.
- **usuario_perfil** — `id (PK)`, `colaborador_id (FK)`, `perfil ENUM('LIDER','RH','DIRETORIA')`. Escopo: Líder = só sua(s) árvore(s); RH/Diretoria = tudo.

### Relação central
`colaborador.lider_id → colaborador.id` forma a árvore. FKs de `colaborador` apontam para as listas. `cargo.nivel_id → nivel_hierarquico`.

---

## 7. Regras de importação (Excel → banco), detalhado

1. Casar cada linha por `codigo_dp` (matrícula).
2. **Upsert:** existe → atualiza; não existe → insere.
3. Ausentes do arquivo / situação inativa → `ativo=false` + fecha registro em `colaborador_historico` (soft delete).
4. Cargo/Área/Local do arquivo: normalizar (`trim`, lower, sem acento) e casar por `nome_normalizado`; se não existir, **criar automaticamente** na lista.
5. `tipo_contratacao`: inferir `PJ` se a matrícula começa com "PJ", senão `CLT` (confirmar com usuário se há regra melhor).
6. **Validar antes de confirmar** (gerar prévia por linha em `importacao_item`): matrícula única; líder existente; sem ciclo; nível do líder coerente (alerta); situação na lista; obrigatórios preenchidos. **Nada entra sem passar pela prévia.**

---

## 8. Perguntas em aberto (confirmar com o usuário Rafael antes de gravar)

1. **Raízes:** apenas **Presidente e Conselheiro** podem ficar sem líder? (assumido, mas não 100% confirmado)
2. **Lista oficial de situações** e, para cada uma, o valor de `ativo_na_arvore` (quais aparecem no organograma).
3. **Tabela de nível por cargo** confiável (a base oficial está inutilizável; complementar os cargos de obra).
4. **Autenticação:** e-mail corporativo/SSO? Como amarrar `usuario_perfil` ao login.
5. **Hierarquia de áreas** (`setor_pai_id`): entra já ou fica só preparada?
6. **Regra CLT/PJ:** inferir por prefixo "PJ" é suficiente ou haverá coluna/fonte melhor?

---

## 9. Convenções e cuidados para a IA

- **Idioma:** todo conteúdo de produto, comentários e nomes de campo em **português** (como já está).
- **Não** reintroduzir `next/font/google` (usar `@import` no CSS).
- **Não** transformar a hierarquia em grafo/multi-gestor — é árvore.
- **Não** usar o campo `Cod. Nivel Hierar. Cargo` da planilha como nível (é lixo).
- **Não** apagar registros — sempre soft delete + histórico.
- **Preserve** os códigos do DP como referência externa; a chave é o UUID.
- Ao mexer no protótipo, mantenha a separação: `data/` (dados/listas), `components/` (UI), `app/` (rotas).
- Se for criar API/serviço de banco, mantenha as credenciais do MySQL **fora do repositório** (`.env`, já ignorado no `.gitignore`).

---

## 10. Arquivos de referência (na pasta pai `../`)

- `Logica_Portal_Organograma_INC.docx` — lógica do produto (v0.9).
- `Modelagem_Banco_Organograma_INC.docx` — modelagem do banco (v1.0, explicativa).
- `Organograma Institucional v1.xlsx` — **base oficial** para carga.
- `organograma_exemplo_TI.html` — protótipo HTML estático inicial (referência de layout).

_Última atualização deste documento: 06/07/2026 (gerado no Cowork antes de migrar a etapa de banco para o Claude Code)._
