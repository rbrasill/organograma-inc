"use client";

// Cabeçalho global do portal ("hero"): gradiente da marca + logo oficial INC
// + menu de funcionalidades em cards — o MESMO em todas as páginas.
// O card da página atual fica destacado. Na home, Importar abre o modal
// direto (via onAcao); nas demais páginas esse card navega para a home com
// ?abrir=importar, que abre o modal ao chegar.

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  InboxIcon, PencilIcon, UserIcon, UploadIcon, DownloadIcon, GridIcon, BriefcaseIcon, LogoutIcon,
} from "@/components/icons";

const ITENS = [
  { key: "solicitacoes", href: "/solicitacoes", label: "Solicitações", Icon: InboxIcon, title: "Solicitações de ajuste recebidas pelo RH" },
  { key: "colaboradores", href: "/colaboradores", label: "Editar colaboradores", Icon: PencilIcon, title: "Localizar e editar dados de colaboradores" },
  { key: "pj", href: "/pj", label: "Colaboradores PJ", Icon: BriefcaseIcon, title: "Gerenciar prestadores PJ: cadastrar, editar, status, excluir" },
  { key: "lideres", href: "/lideres", label: "Líderes por área", Icon: UserIcon, title: "Diretores, áreas e troca de líder" },
  { key: "importar", href: "/?abrir=importar", label: "Importar Excel", Icon: UploadIcon, title: "Subir a base oficial por Excel", acao: true },
  { key: "exportar", href: "/api/colaboradores/exportar", label: "Exportar base", Icon: DownloadIcon, title: "Baixar toda a base em Excel", download: true },
  { key: "catalogos", href: "/catalogos", label: "Catálogos", Icon: GridIcon, title: "Cargos, níveis, locais, regionais e situações" },
];

export default function HeroNav({ titulo, subtitulo, atual, onAcao }) {
  const [pendentes, setPendentes] = useState(0);
  const [sessao, setSessao] = useState(null); // { autenticado, nome } quando a auth está ligada

  // badge de solicitações pendentes com POLLING: consulta a cada 45s para o
  // número se atualizar "ao vivo" (sem recarregar a página) quando um
  // colaborador envia um ajuste. Aba em segundo plano não consulta; ao
  // voltar para a aba, atualiza na hora.
  useEffect(() => {
    let ativo = true;
    async function carregarPendentes() {
      if (document.visibilityState === "hidden") return;
      try {
        const r = await fetch("/api/solicitacoes?contagem=1"); // modo leve: só o COUNT
        const j = await r.json();
        if (ativo && j.ok) setPendentes(j.pendentes);
      } catch {}
    }
    carregarPendentes();
    const t = setInterval(carregarPendentes, 45000);
    const aoVoltar = () => { if (document.visibilityState === "visible") carregarPendentes(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      ativo = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);

  useEffect(() => {
    fetch("/api/auth/sessao")
      .then((r) => r.json())
      .then((j) => { if (j.ok && j.ativa && j.autenticado) setSessao(j); })
      .catch(() => {});
  }, []);

  async function sair() {
    try { await fetch("/api/auth/sair", { method: "POST" }); } catch {}
    window.location.href = "/login";
  }

  return (
    <div className="hero">
      <div className="hero-brand">
        <Link href="/" title="Ir para o organograma">
          <img className="hero-logo" src="/inc-oficial.svg" alt="INC Empreendimentos" />
        </Link>
        <div className="hero-txt">
          <h1>{titulo}</h1>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        {sessao && (
          <div className="hero-user">
            <span className="hu-nome" title={sessao.nome}>Olá, {(sessao.nome || "").split(" ")[0]}</span>
            <button className="hu-sair" onClick={sair} title="Encerrar a sessão">
              <LogoutIcon size={14} /> Sair
            </button>
          </div>
        )}
      </div>
      <div className="hero-cards">
        {ITENS.map((it) => {
          const cls = `hero-card ${atual === it.key ? "on" : ""}`;
          const conteudo = (
            <>
              <span className="hc-ic"><it.Icon size={17} /></span>
              <span className="hc-nome">
                {it.label}
                {it.key === "solicitacoes" && pendentes > 0 && <i className="hc-badge">{pendentes}</i>}
              </span>
            </>
          );
          if (it.acao && onAcao) {
            return (
              <button key={it.key} className={cls} onClick={() => onAcao(it.key)} title={it.title}>
                {conteudo}
              </button>
            );
          }
          if (it.download) {
            return <a key={it.key} className={cls} href={it.href} title={it.title}>{conteudo}</a>;
          }
          return <Link key={it.key} href={it.href} className={cls} title={it.title}>{conteudo}</Link>;
        })}
      </div>
    </div>
  );
}
