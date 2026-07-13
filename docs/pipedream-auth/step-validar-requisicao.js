// Step "validar_requisicao" — roda ANTES do ifelse. É o único lugar que:
//   * confere o header secreto (só o Next.js conhece o valor real);
//   * confere o formato do payload E o domínio do e-mail;
//   * normaliza os campos;
//   * decide a AÇÃO ("solicitar" ou "validar") que os braços do ifelse leem.
// Sem isso duplicado nos dois braços, nenhum deles fica desprotegido.
//
// Payloads aceitos (ver payload-solicitar-codigo.json / payload-validar-codigo.json):
//   solicitar: { acao: "solicitar", email, nome }
//   validar:   { acao: "validar",   email, codigo }
//
// Condição do ifelse depois deste step:
//   steps.validar_requisicao.$return_value.acao === "solicitar"

export default defineComponent({
  async run({ steps, $ }) {
    const headers = steps.trigger.event.headers ?? {};
    const body = steps.trigger.event.body ?? {};

    // 1) segredo compartilhado com o Next.js — headers chegam em minúsculas
    const secretEsperado = process.env.INC_AUTH_SECRET;
    if (!secretEsperado || headers["x-inc-secret"] !== secretEsperado) {
      await $.respond({
        status: 401,
        body: { success: false, message: "Não autorizado." },
      });
      $.flow.exit("Execução interrompida: header x-inc-secret ausente ou inválido.");
      return;
    }

    // 2) formato básico do payload
    const acao = body.acao;
    if (acao !== "solicitar" && acao !== "validar") {
      await $.respond({
        status: 400,
        body: { success: false, message: 'Campo "acao" deve ser "solicitar" ou "validar".' },
      });
      $.flow.exit(`Execução interrompida: acao inválida (${acao}).`);
      return;
    }

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

    // 3) domínio corporativo — checado aqui uma vez só, vale para as duas ações
    if (!email.endsWith("@meuinc.com.br")) {
      await $.respond({
        status: 403,
        body: { success: false, message: "Domínio de e-mail não autorizado." },
      });
      $.flow.exit(`Execução interrompida: domínio não autorizado (${email}).`);
      return;
    }

    // 4) validação específica de cada ação
    if (acao === "solicitar") {
      const nome = typeof body.nome === "string" ? body.nome.trim() : null;
      $.export("acao", acao);
      $.export("email", email);
      $.export("nome", nome);
      return { acao, email, nome };
    }

    // acao === "validar"
    const codigo = typeof body.codigo === "string" ? body.codigo.trim() : "";
    if (!/^\d{6}$/.test(codigo)) {
      await $.respond({
        status: 400,
        body: { success: false, message: "Código deve ter 6 dígitos numéricos." },
      });
      $.flow.exit(`Execução interrompida: código em formato inválido (${codigo}).`);
      return;
    }
    $.export("acao", acao);
    $.export("email", email);
    $.export("codigo", codigo);
    return { acao, email, codigo };
  },
});
