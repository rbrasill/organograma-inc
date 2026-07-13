// Step 4 — "return_response": resposta de SUCESSO do workflow.
// Só executa se o e-mail foi enviado (um erro no send_email_code pára o
// workflow antes daqui, e o Next.js trata a ausência de 200 como falha de
// envio — apagando o código que tinha acabado de gravar).
// As respostas de erro (401/400/403) saem direto do step validar_envio.

export default defineComponent({
  async run({ steps, $ }) {
    await $.respond({
      status: 200,
      headers: { "content-type": "application/json" },
      body: {
        success: true,
        message: "Código de verificação enviado.",
      },
    });
  },
});
