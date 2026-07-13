# Login por código de e-mail — papel do Pipedream

Arquitetura final (aplicação no servidor da INC):

- O **Next.js é o cérebro**: gera o código, guarda só o HASH no MySQL
  (tabela `auth_codigo`), valida o que o usuário digita, controla expiração,
  uso único, tentativas e sessão.
- O **Pipedream é só o carteiro**: recebe `{ email, nome, codigo }` prontos
  e entrega o e-mail. Ele NÃO gera, NÃO guarda e NÃO valida código.

```
navegador → POST /api/auth/solicitar (Next.js)
              gera código, salva hash no MySQL
              → POST https://eo15edoyazwrfml.m.pipedream.net  ← este workflow
                   { email, nome, codigo } + header x-inc-secret
                   trigger → validar_envio → send_email_code → return_response

navegador → POST /api/auth/validar (Next.js)
              confere hash/expiração/tentativas no MySQL → cria sessão
              (o Pipedream não participa desta etapa)
```

## Payload que o Next.js envia (ver payload-enviar-codigo.json)

```json
{
  "email": "colaborador@meuinc.com.br",
  "nome": "Nome Sobrenome",
  "codigo": "123456"
}
```

Headers: `Content-Type: application/json` e `x-inc-secret: <valor de INC_AUTH_SECRET>`.

## Os 4 steps do workflow

### 1. `trigger` (HTTP)
Já existe — é a URL acima. Um único ajuste na configuração: em
**HTTP Response**, escolha **"Return a custom response from your workflow"**,
para que as respostas venham dos `$.respond()` dos steps (401/400/403/200)
em vez de um 200 automático.

### 2. `validar_envio` (Node.js — substitui o antigo generate_code)
Cole o conteúdo de `step-validar-envio.js`. O que ele faz, em ordem:

1. Confere o header `x-inc-secret` contra a variável de ambiente
   `INC_AUTH_SECRET` do Pipedream (Settings → Environment Variables).
   Sem o segredo → responde **401** e encerra. É isso que impede
   qualquer pessoa com a URL de disparar e-mails.
2. Confere o formato do payload: `email` válido, `codigo` com 6 dígitos.
   Errado → **400** e encerra.
3. Confere o domínio `@meuinc.com.br` (defesa em profundidade — o Next.js
   já validou antes). Outro domínio → **403** e encerra.
4. Exporta `email`, `nome` (com fallback derivado do e-mail:
   "nome.sobrenome" → "Nome Sobrenome") e `codigo` para o step de envio.

Ele NÃO gera código (vem pronto do Next.js) e NÃO grava nada.

### 3. `send_email_code` (ação nativa de e-mail — já existe)
Só trocar os campos para ler deste novo step:

- **Para**: `{{steps.validar_envio.$return_value.email}}`
- **Assunto**: `Seu código de acesso ao Portal INC: {{steps.validar_envio.$return_value.codigo}}`
- **Corpo** (texto sugerido):

```
Olá, {{steps.validar_envio.$return_value.nome}}!

Seu código de acesso ao Portal de Organograma INC é:

    {{steps.validar_envio.$return_value.codigo}}

Este código é válido por 10 minutos e só pode ser usado uma vez.

Não compartilhe este código com ninguém — a equipe INC nunca vai
pedi-lo por telefone ou mensagem.

Se você não tentou acessar a plataforma, ignore este e-mail.
```

### 4. `return_response` (Node.js)
Cole o conteúdo de `step-return-response.js`: responde
**200 `{ "success": true, "message": "Código de verificação enviado." }`**.
Só executa se o e-mail foi enviado (se o step 3 falhar, o workflow pára e o
Next.js trata como erro de envio, apagando o código que tinha gerado).

## Teste manual (sem o Next.js)

```bash
curl -X POST https://eo15edoyazwrfml.m.pipedream.net \
  -H "Content-Type: application/json" \
  -H "x-inc-secret: SEU_SEGREDO_AQUI" \
  -d '{"email":"seu.nome@meuinc.com.br","nome":"Seu Nome","codigo":"123456"}'
```

Esperado: e-mail na caixa de entrada + resposta 200. Sem o header
`x-inc-secret` (ou com valor errado): 401 e nenhum e-mail.

## Variável de ambiente no Pipedream

| Nome              | Valor                                              |
|-------------------|----------------------------------------------------|
| `INC_AUTH_SECRET` | string longa aleatória — a MESMA do `.env` do Next |

Gere com: `openssl rand -hex 32`
