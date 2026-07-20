"use client";

// Tela de login (layout split: marca à esquerda, formulário à direita).
// Passo único: CPF + data de nascimento → POST /api/auth/entrar → sessão.
// A resposta de erro é sempre genérica (a API nunca revela qual campo errou
// nem se o CPF existe — anti-enumeração); aqui só refletimos a mensagem.
// O fluxo por código de e-mail segue existindo na API (dormente, para a
// fase 2 dos perfis de acesso) — esta tela não o usa mais.

import { useState } from "react";
import { UserIcon, KeyIcon, AlertIcon } from "@/components/icons";

// máscara visual 000.000.000-00 (o envio é só dígitos)
function formatarCpf(v) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

export default function LoginView() {
  const [cpf, setCpf] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function entrar(e) {
    e?.preventDefault();
    setErro("");
    const dig = cpf.replace(/\D/g, "");
    if (dig.length !== 11) { setErro("Digite o CPF completo (11 dígitos)."); return; }
    if (!nascimento) { setErro("Informe sua data de nascimento."); return; }
    setEnviando(true);
    try {
      const r = await fetch("/api/auth/entrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: dig, nascimento }),
      });
      const txt = await r.text();
      let j; try { j = JSON.parse(txt); } catch { j = { ok: false, erro: `Servidor respondeu ${r.status}.` }; }
      if (!j.ok) { setErro(j.erro || "CPF ou data de nascimento não conferem."); setEnviando(false); return; }
      // sessão criada (cookie httpOnly): recarrega já autenticado
      window.location.href = "/";
    } catch (e2) {
      setErro(`Falha de rede: ${e2.message}`);
      setEnviando(false);
    }
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
          <p className="login-sub">Entre com seu CPF e sua data de nascimento.</p>

          {erro && <div className="login-alerta erro"><AlertIcon size={15} /><span>{erro}</span></div>}

          <form onSubmit={entrar}>
            <label className="login-campo">
              <span className="lc-ic"><UserIcon size={19} /></span>
              <input
                inputMode="numeric"
                autoFocus
                autoComplete="username"
                placeholder="CPF — 000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(formatarCpf(e.target.value))}
              />
            </label>
            <label className="login-campo">
              <span className="lc-ic"><KeyIcon size={19} /></span>
              <input
                type="date"
                autoComplete="bday"
                title="Data de nascimento"
                value={nascimento}
                onChange={(e) => setNascimento(e.target.value)}
              />
            </label>
            <button className="login-btn" type="submit" disabled={enviando}>
              {enviando ? "Entrando..." : "Entrar"}
            </button>
            <p className="login-nota">
              Use a data de nascimento cadastrada no Departamento Pessoal.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
