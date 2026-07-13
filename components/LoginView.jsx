"use client";

// Tela de login passwordless (layout split: marca à esquerda, formulário à
// direita). Dois passos:
//   1. e-mail corporativo → POST /api/auth/solicitar → envia o código
//   2. código de 6 dígitos → POST /api/auth/validar → cria a sessão e entra
// A resposta de "solicitar" é genérica (não revela se o e-mail existe), então
// avançamos sempre para o passo do código, com aviso neutro.

import { useEffect, useRef, useState } from "react";
import { MailIcon, KeyIcon, CheckIcon, AlertIcon } from "@/components/icons";

const COOLDOWN = 60; // segundos até poder reenviar o código

export default function LoginView() {
  const [etapa, setEtapa] = useState("email"); // "email" | "codigo"
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const codigoRef = useRef(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    if (etapa === "codigo") codigoRef.current?.focus();
  }, [etapa]);

  async function post(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { j = { ok: false, erro: `Servidor respondeu ${r.status}.` }; }
    return { status: r.status, ...j };
  }

  async function solicitar(e) {
    e?.preventDefault();
    setErro(""); setAviso("");
    const mail = email.trim().toLowerCase();
    if (!mail) { setErro("Informe seu e-mail corporativo."); return; }
    if (!mail.endsWith("@meuinc.com.br")) {
      setErro("Use seu e-mail corporativo @meuinc.com.br.");
      return;
    }
    setEnviando(true);
    const j = await post("/api/auth/solicitar", { email: mail });
    setEnviando(false);
    if (!j.ok) { setErro(j.erro || "Não foi possível enviar o código."); return; }
    setEtapa("codigo");
    setCooldown(COOLDOWN);
    setAviso("Se o e-mail estiver cadastrado, enviamos um código de 6 dígitos. Válido por 10 minutos.");
  }

  async function validar(e) {
    e?.preventDefault();
    setErro("");
    if (!/^\d{6}$/.test(codigo.trim())) { setErro("Digite o código de 6 dígitos."); return; }
    setEnviando(true);
    const j = await post("/api/auth/validar", { email: email.trim().toLowerCase(), codigo: codigo.trim() });
    setEnviando(false);
    if (!j.ok) { setErro(j.erro || "Código inválido."); return; }
    // sessão criada (cookie httpOnly): recarrega já autenticado
    window.location.href = "/";
  }

  async function reenviar() {
    if (cooldown > 0 || enviando) return;
    setCodigo("");
    await solicitar();
  }

  function trocarEmail() {
    setEtapa("email"); setCodigo(""); setErro(""); setAviso(""); setCooldown(0);
  }

  return (
    <div className="login-split">
      <aside className="login-visual">
        <img className="login-logo" src="/inc-oficial.svg" alt="INC Empreendimentos" />
        <div className="login-visual-txt">
          <h1>Organograma INC</h1>
          <p>Portal de estrutura organizacional da INC Empreendimentos.</p>
        </div>
      </aside>

      <main className="login-form-wrap">
        <div className="login-form">
          <h2>Acessar o portal</h2>
          <p className="login-sub">
            {etapa === "email"
              ? "Entre com seu e-mail corporativo — enviaremos um código de acesso."
              : `Digite o código que enviamos para ${email.trim().toLowerCase()}.`}
          </p>

          {erro && <div className="login-alerta erro"><AlertIcon size={15} /><span>{erro}</span></div>}
          {aviso && !erro && <div className="login-alerta ok"><CheckIcon size={14} /><span>{aviso}</span></div>}

          {etapa === "email" ? (
            <form onSubmit={solicitar}>
              <label className="login-campo">
                <span className="lc-ic"><MailIcon size={19} /></span>
                <input
                  type="email"
                  autoFocus
                  autoComplete="email"
                  placeholder="nome.sobrenome@meuinc.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button className="login-btn" type="submit" disabled={enviando}>
                {enviando ? "Enviando..." : "Enviar código"}
              </button>
            </form>
          ) : (
            <form onSubmit={validar}>
              <label className="login-campo">
                <span className="lc-ic"><KeyIcon size={19} /></span>
                <input
                  ref={codigoRef}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  className="login-codigo"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </label>
              <button className="login-btn" type="submit" disabled={enviando}>
                {enviando ? "Verificando..." : "Entrar"}
              </button>
              <div className="login-rodape">
                <button type="button" className="login-link" onClick={trocarEmail}>
                  Trocar e-mail
                </button>
                <button type="button" className="login-link" onClick={reenviar} disabled={cooldown > 0 || enviando}>
                  {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar código"}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
