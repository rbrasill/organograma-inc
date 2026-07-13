// Step 2 — "validar_envio" (substitui o antigo generate_code).
// O Pipedream aqui é SÓ o carteiro: o código chega pronto do Next.js
// (que já o gravou como hash no MySQL). Este step apenas:
//   1. confere o header secreto (barra quem só conhece a URL);
//   2. confere o formato do payload { email, nome, codigo };
//   3. confere o domínio @meuinc.com.br (defesa em profundidade);
//   4. exporta os campos para o send_email_code.
// Configure INC_AUTH_SECRET em Settings → Environment Variables (o mesmo
// valor do .env do Next.js).

export default defineComponent({
  async run({ steps, $ }) {
    const headers = steps.trigger.event.headers ?? {};
    const body = steps.trigger.event.body ?? {};

    // 1) segredo compartilhado — headers chegam com nomes em minúsculas
    const secretEsperado = process.env.INC_AUTH_SECRET;
    if (!secretEsperado || headers["x-inc-secret"] !== secretEsperado) {
      await $.respond({
        status: 401,
        body: { success: false, message: "Não autorizado." },
      });
      $.flow.exit("Execução interrompida: header x-inc-secret ausente ou inválido.");
      return;
    }

    // 2) formato do payload
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      await $.respond({
        status: 400,
        body: { success: false, message: "E-mail não informado ou em formato inválido." },
      });
      $.flow.exit(`Execução interrompida: e-mail inválido (${body.email}).`);
      return;
    }
    const codigo = typeof body.codigo === "string" ? body.codigo.trim() : "";
    if (!/^\d{6}$/.test(codigo)) {
      await $.respond({
        status: 400,
        body: { success: false, message: "Código ausente ou em formato inválido." },
      });
      $.flow.exit("Execução interrompida: código ausente/inválido no payload.");
      return;
    }

    // 3) domínio corporativo
    if (!email.endsWith("@meuinc.com.br")) {
      await $.respond({
        status: 403,
        body: { success: false, message: "Domínio de e-mail não autorizado." },
      });
      $.flow.exit(`Execução interrompida: domínio não autorizado (${email}).`);
      return;
    }

    // 4) nome: usa o enviado; sem ele, deriva de "nome.sobrenome@..."
    let nome = typeof body.nome === "string" ? body.nome.trim() : "";
    if (!nome) {
      nome = email
        .split("@")[0]
        .split(/[._-]+/)
        .filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");
    }

    $.export("email", email);
    $.export("nome", nome);
    $.export("codigo", codigo);
    return { email, nome, codigo };
  },
});
