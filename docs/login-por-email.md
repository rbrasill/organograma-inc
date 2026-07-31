# Login por código de e-mail — guia para reativar

> Registro da análise feita em 2026-07-27. O login por **código de e-mail**
> está inteiro no código, porém **dormente**. Hoje o login ativo é
> **CPF + data de nascimento**. Este documento é o passo a passo para voltar a
> usar o e-mail quando quisermos.

## Como funciona (já implementado)

O Next.js é o cérebro; o Pipedream é só o carteiro que entrega o e-mail.

```
navegador → POST /api/auth/solicitar   (valida domínio @meuinc.com.br,
                                         rate-limit, gera código, grava só o
                                         HASH em auth_codigo, chama o Pipedream)
              → POST https://eo15edoyazwrfml.m.pipedream.net
                   { email, nome, codigo } + header x-inc-secret
navegador → POST /api/auth/validar     (confere hash/expiração/tentativas,
                                         cria a sessão em cookie httpOnly)
```

Arquivos envolvidos (todos presentes):
- `app/api/auth/solicitar/route.js` — passo 1 (pede o código).
- `app/api/auth/validar/route.js` — passo 2 (valida o código, cria sessão).
- `lib/auth.js` — geração/hash do código, assinatura da sessão (HMAC), cookie.
- `middleware.js` — protege páginas/APIs; **só liga** com `AUTH_SESSION_SECRET`.
- `docs/pipedream-auth/` — contrato do workflow do Pipedream (steps + HTML do e-mail).
- Tabela `auth_codigo` no MySQL — **confirmada como existente**.

A URL `https://eo15edoyazwrfml.m.pipedream.net` é a mesma já registrada como
`PIPEDREAM_AUTH_URL` no `.env.example`. Mesmo workflow, mesmo contrato.

## Os 2 bloqueios a resolver ANTES de trocar a tela

### 1. Dados — quase ninguém tem e-mail na base
Em 2026-07-27: de **1.279** colaboradores ativos, só **2** tinham e-mail
cadastrado. O `solicitar` só manda código para colaborador ativo com aquele
e-mail — então, sem popular os e-mails, trocar o login por e-mail tranca
praticamente todo mundo para fora.

**Pré-requisito:** importar/preencher os e-mails corporativos dos colaboradores
(via extrato do DP ou edição). Reconferir a contagem antes de ativar:

```sql
SELECT COUNT(*) AS ativos,
       SUM(email LIKE '%@meuinc.com.br') AS com_email
  FROM colaborador WHERE ativo = 1;
```

### 2. Perfil de acesso não vai na sessão do e-mail
O login por CPF (`/api/auth/entrar`) grava o `perfil` na sessão (lido de
`usuario_perfil`, ou ADMIN via `ACESSO_ADMIN_CPFS`). Já o `validar` do e-mail
cria a sessão só com `{ email, nome }` — **sem perfil**. Assim, quem entra por
e-mail cai como PADRÃO e perde as telas de admin (/acessos, /colaboradores,
/pj, /catalogos).

**Ajuste necessário em `app/api/auth/validar/route.js`:** ao criar a sessão,
resolver o colaborador e o perfil, no mesmo formato do `entrar`:

```js
// depois de validar o código, antes de assinar a sessão:
const [[colab]] = await pool.query(
  "SELECT id, codigo_dp, nome FROM colaborador WHERE email = ? AND ativo = 1 LIMIT 1",
  [email]
);
const [[linhaPerfil]] = await pool.query(
  "SELECT perfil FROM usuario_perfil WHERE colaborador_id = ? LIMIT 1",
  [colab.id]
);
const perfil = linhaPerfil?.perfil || "PADRAO"; // (avaliar um ADMIN-por-email
                                                 //  equivalente ao ACESSO_ADMIN_CPFS)
const token = assinarSessao({
  colaboradorId: colab.id, matricula: colab.codigo_dp, nome: colab.nome, perfil, email,
});
```

Obs.: `ACESSO_ADMIN_CPFS` é por CPF; se admins forem entrar por e-mail, criar
uma rede de segurança equivalente por e-mail (ex.: `ACESSO_ADMIN_EMAILS`).

## Opções de ativação

| Opção | O que é | Viável hoje |
|---|---|---|
| **A. E-mail no lugar do CPF** | Substitui de vez | ❌ só após popular e-mails de todos |
| **B. E-mail + CPF lado a lado** (recomendada) | Tela com duas formas; quem tem e-mail usa e-mail, o resto CPF | ✅ funciona já e migra suave |
| **C. E-mail só para um grupo** | Ativa e-mail p/ quem já tem (admins/diretoria) | ✅ é a B com foco menor |

## Passo a passo para ligar (opção B recomendada)

1. **Env vars** (Vercel → Settings → Environment Variables):
   - `PIPEDREAM_AUTH_URL=https://eo15edoyazwrfml.m.pipedream.net`
   - `INC_AUTH_SECRET=<o MESMO valor configurado no Pipedream>`
   - `AUTH_SESSION_SECRET=<segredo forte>` ← **este liga o middleware**
   - (opcional) `ACESSO_ADMIN_EMAILS=<e-mails admin, se login por e-mail>`
2. **Pipedream**: confirmar que o workflow na URL acima está publicado e com a
   env `INC_AUTH_SECRET`. Testar com o `curl` de `docs/pipedream-auth/README.md`.
3. **Backend**: ajustar `validar/route.js` para gravar `perfil` na sessão (acima).
4. **Frontend**: recolocar na `components/LoginView.jsx` o fluxo por e-mail
   (2 passos: e-mail → código). Na opção B, oferecer as duas formas (abas
   "E-mail" e "CPF"). A tela atual só faz CPF (`/api/auth/entrar`).
5. **Dados**: garantir e-mails na base (senão o e-mail só serve para quem tem).
6. Antes de mexer no código, gerar **prévia em HTML** da tela de login para validar.

## Cuidados

- `AUTH_SESSION_SECRET` ausente = portal **aberto** (interruptor de segurança
  anti-lock-out). Definir só quando o login estiver pronto de ponta a ponta.
- O Pipedream nunca gera nem valida código — só entrega o e-mail.
- O CPF nunca entra no token de sessão (payload é base64 legível no cookie).
