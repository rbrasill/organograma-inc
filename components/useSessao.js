"use client";

// Sessão do usuário logado, para as telas esconderem ações por perfil.
// (Só UX: quem manda de verdade são o middleware e as guardas das APIs.)
//   { pronto, ativa, autenticado, nome, matricula, perfil, nivel }
// Auth desligada (sem AUTH_SESSION_SECRET) → nivel ADMIN: tudo aparece,
// coerente com o interruptor seguro do middleware.

import { useEffect, useState } from "react";
import { NIVEL, nivelDe } from "@/lib/perfis";

export default function useSessao() {
  const [s, setS] = useState({
    pronto: false, ativa: true, autenticado: false,
    nome: "", matricula: "", perfil: "PADRAO", nivel: NIVEL.PADRAO,
  });

  useEffect(() => {
    let vivo = true;
    fetch("/api/auth/sessao")
      .then((r) => r.json())
      .then((j) => {
        if (!vivo || !j.ok) return;
        const ativa = !!j.ativa;
        setS({
          pronto: true,
          ativa,
          autenticado: !!j.autenticado,
          nome: j.nome || "",
          matricula: j.matricula || "",
          perfil: ativa ? (j.perfil || "PADRAO") : "ADMIN",
          nivel: ativa ? nivelDe(j.perfil) : NIVEL.ADMIN,
        });
      })
      .catch(() => { if (vivo) setS((v) => ({ ...v, pronto: true })); });
    return () => { vivo = false; };
  }, []);

  return s;
}
