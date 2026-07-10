"use client";

// Cabeçalho global do portal ("hero"): gradiente da marca + logo oficial INC
// + menu de funcionalidades em cards — o MESMO em todas as páginas.
// O card da página atual fica destacado. Na home, Importar/Gerenciar áreas
// abrem os modais direto (via onAcao); nas demais páginas esses cards
// navegam para a home com ?abrir=<acao>, que abre o modal ao chegar.

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  InboxIcon, PencilIcon, UserIcon, UploadIcon, DownloadIcon, MergeIcon, GridIcon,
} from "@/components/icons";

const ITENS = [
  { key: "solicitacoes", href: "/solicitacoes", label: "Solicitações", Icon: InboxIcon, title: "Solicitações de ajuste recebidas pelo RH" },
  { key: "colaboradores", href: "/colaboradores", label: "Editar colaboradores", Icon: PencilIcon, title: "Localizar e editar dados de colaboradores" },
  { key: "lideres", href: "/lideres", label: "Líderes por área", Icon: UserIcon, title: "Diretores, áreas e troca de líder" },
  { key: "importar", href: "/?abrir=importar", label: "Importar Excel", Icon: UploadIcon, title: "Subir a base oficial por Excel", acao: true },
  { key: "exportar", href: "/api/colaboradores/exportar", label: "Exportar base", Icon: DownloadIcon, title: "Baixar toda a base em Excel", download: true },
  { key: "areas", href: "/?abrir=areas", label: "Gerenciar áreas", Icon: MergeIcon, title: "Renomear e mesclar áreas", acao: true },
  { key: "catalogos", href: "/catalogos", label: "Catálogos", Icon: GridIcon, title: "Cargos, níveis, locais, regionais e situações" },
];

export default function HeroNav({ titulo, subtitulo, atual, onAcao }) {
  const [pendentes, setPendentes] = useState(0);
  useEffect(() => {
    fetch("/api/solicitacoes?status=pendente")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setPendentes(j.pendentes); })
      .catch(() => {});
  }, []);

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
