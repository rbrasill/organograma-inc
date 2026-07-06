# Banco de dados — Portal de Organograma INC

DDL e seeds do banco **`rentis39_organograma_inc`** (MySQL 5.7.44), conforme a
modelagem do documento `Instruções Inteligencia Artificial/Modelagem_Banco_Organograma_INC.md`.

## Arquivos (rodar nesta ordem)

| Ordem | Arquivo | Conteúdo |
|-------|---------|----------|
| 1 | `01_schema.sql` | `CREATE TABLE` de todas as tabelas + FKs + índices |
| 2 | `02_seeds.sql` | Listas de referência (níveis, situações) — **proposta a confirmar** |

## Estrutura (13 tabelas)

- **Referência (lookup):** `nivel_hierarquico`, `cargo`, `setor`, `local_trabalho`, `regional`, `situacao`
- **Núcleo:** `colaborador` (auto-relacionamento `lider_id` forma a árvore)
- **Histórico:** `colaborador_historico`, `log_auditoria`
- **Processos:** `importacao`, `importacao_item`, `solicitacao_ajuste`, `usuario_perfil`

## Decisões técnicas (MySQL 5.7)

- **PK = UUID v4 em `CHAR(36)`.** O 5.7 não gera UUID por `DEFAULT`; o `id` é
  gerado pela **aplicação** (as seeds usam `UUID()` no `INSERT` por conveniência).
- **CHECK não é imposto no 5.7.** As regras da árvore (sem ciclo, `lider_id != id`,
  raízes permitidas, coerência de nível) rodam na **aplicação/importação**, não no
  banco. Ver o bloco "REGRAS" no fim de `01_schema.sql`.
- **FKs de `colaborador` (cargo/setor/local/situação) são `NULL`** para tolerar a
  carga inicial (a base Excel tem campos em branco). A obrigatoriedade para
  registros ativos é validada na aplicação.
- Dependência circular `setor` ⇄ `colaborador` resolvida com `ALTER TABLE` após
  criar `colaborador`.
- `InnoDB` + `utf8mb4` em todas as tabelas.

## Pendências antes de rodar (CLAUDE.md, seção 8)

Não bloqueiam a **estrutura** (só as seeds/regras). A confirmar com o Rafael:

1. **Raízes** sem líder: apenas Presidente e Conselheiro? (regra de aplicação)
2. **Situações que aparecem na árvore** (`ativo_na_arvore`) — ver proposta em `02_seeds.sql`.
3. **Nível por cargo** confiável (a base oficial é inutilizável; a do GEM cobre só administrativos).
4. **Autenticação** (e-mail corporativo/SSO) para amarrar `usuario_perfil`.
5. **Hierarquia de áreas** (`setor_pai_id`): já incluída como coluna preparada (nula/não usada).
6. **CLT/PJ**: inferido pelo prefixo "PJ" da matrícula (default no schema).

## Observação sobre a tabela `areas`

O banco já contém uma tabela `areas` (provavelmente de teste anterior). O schema
novo usa `setor` para "área". A `areas` **não é tocada** por estes scripts — decidir
depois se deve ser migrada ou removida.
