# Banco de dados — Portal de Organograma INC

DDL e seeds do banco **`rentis39_organograma_inc`** (MySQL 5.7.44), alinhados à
**base oficial v2** (`Organograma_Institucional_v2.xlsx`) e à tabela de **famílias
de nível hierárquico**.

## Arquivos

| Arquivo | Quando rodar | Conteúdo |
|---------|--------------|----------|
| `01_schema.sql` | instalação nova | `CREATE TABLE` de todas as tabelas (estrutura v2) + FKs + índices |
| `02_seeds.sql`  | após schema/migração | Dados canônicos v2: níveis, situações, setores, locais, regionais, cargos |
| `03_migracao_v2.sql` | banco já existente (uma vez) | Limpa dados de teste e evolui o schema provisório para a v2; depois rodar `02_seeds.sql` |

## Estrutura (13 tabelas)

- **Referência (lookup):** `nivel_hierarquico`, `cargo`, `setor`, `local_trabalho`, `regional`, `situacao`
- **Núcleo:** `colaborador` (auto-relacionamento `lider_id` forma a árvore)
- **Histórico:** `colaborador_historico`, `log_auditoria`
- **Processos:** `importacao`, `importacao_item`, `solicitacao_ajuste`, `usuario_perfil`

## Estrutura de níveis (base v2)

`nivel_hierarquico` é o **catálogo de famílias** (NH500–NH544):

- `codigo_nh` (único) — código oficial do DP.
- `ordem` (1–18, 1 = topo) — **não é única**: várias famílias compartilham a mesma
  altura (ex.: nível 13 tem Técnico, Pedreiro, Carpinteiro…), distinguidas por `variacao` (A–L).
- `cargo.nivel_id` aponta para a família. A validação de coerência da árvore usa
  `ordem` (líder deve ter ordem menor que o subordinado), ignorando a variação.

## Códigos oficiais do DP

Os lookups guardam o código externo do DP, único:
- `setor.codigo_dp` (SET…), `situacao.codigo_dp` (letra: A, F, V…).
- `local_trabalho.codigo_dp` é o **número da obra no DP** (ex.: 472 = Reserva JK),
  o mesmo que vem no prefixo do local no extrato ("472 - Reserva JK") — migração 06
  (a série interna LOCTRA… foi aposentada). Locais sem correspondência no extrato
  ficam com código NULL e casam por nome.
- `cargo.codigo_cargo_dp` é **anotação não-única** (o mesmo cargo aparece com códigos
  diferentes na base — ex.: variantes PJ), então a identidade do cargo é o nome.

## Decisões técnicas (MySQL 5.7)

- **PK = UUID v4 em `CHAR(36)`.** O 5.7 não gera UUID por `DEFAULT`; as seeds usam `UUID()`.
- **CHECK não é imposto no 5.7.** As regras da árvore (sem ciclo, `lider_id != id`,
  raízes permitidas, coerência de nível) rodam na **aplicação/importação**.
- **FKs de `colaborador` (cargo/setor/local/situação) são `NULL`** para tolerar a carga.
- Dependência circular `setor` ⇄ `colaborador` resolvida com `ALTER TABLE`.
- `InnoDB` + `utf8mb4` em todas as tabelas.

## Situações (v2)

10 situações oficiais, todas com `ativo_na_arvore = 1` (a base v2 não traz
inativos/desligados — a importação simplesmente não os inclui):
Ativo, Aviso Prévio, Férias, Licença Mater., Af.Ac.Trabalho, Af.Previdência,
Contrato de Trabalho Suspenso, Apos. por Incapacidade Permanente, Outros, Prisão / Cárcere.

## Observação sobre a tabela `areas`

O banco contém uma tabela `areas` de teste anterior. O schema usa `setor` para "área";
a `areas` **não é tocada** por estes scripts.
