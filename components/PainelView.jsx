"use client";

// Painel de indicadores (GESTOR/ADMIN) — layout validado na prévia v3:
// KPIs no topo + cards por indicador, % em destaque e quantidade como apoio.
// Paleta aprovada pelo produto: Linen/Sand/Charcoal/Taupe + Teal, Amethyst,
// Insight Blue, Warm Coral e Amber (validada para daltonismo/contraste).

import { useEffect, useState } from "react";
import HeroNav from "@/components/HeroNav";
import { AlertIcon } from "@/components/icons";

const COR = {
  teal: "#0E9F9A", ame: "#6D5BD0", blue: "#4E9CD6",
  coral: "#FF7A59", amber: "#D97706", taupe: "#C9BBAA",
};
const APAGADOS = new Set(["Sem regional", "Sem diretoria", "Sem data", "Sem família", "Sem situação"]);
const MAX_FAMILIAS = 12; // famílias exibidas antes de agrupar em "Outras"

const fmt = (n) => Number(n).toLocaleString("pt-BR");

export default function PainelView() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/painel")
      .then((r) => r.json())
      .then((j) => (j.ok ? setDados(j) : setErro(j.erro || "Falha ao carregar.")))
      .catch((e) => setErro(`Falha ao carregar: ${e.message}`));
  }, []);

  const total = dados?.total || 0;
  const pc = (n) => (total ? `${((n / total) * 100).toFixed(1).replace(".", ",")}%` : "—");

  function BarrasH({ dados: linhas, cor }) {
    const mx = Math.max(...linhas.map((d) => d.n), 1);
    return linhas.map((d) => (
      <div className="pn-bh" key={d.rotulo} title={`${d.rotulo}: ${fmt(d.n)} (${pc(d.n)})`}>
        <span className="pn-bh-rot">{d.rotulo}</span>
        <span className="pn-bh-track">
          <span
            className="pn-bh-fill"
            style={{ width: `${Math.max((d.n / mx) * 100, 0.6)}%`, background: APAGADOS.has(d.rotulo) ? COR.taupe : cor }}
          />
        </span>
        <span className="pn-bh-pct">{pc(d.n)}</span>
        <span className="pn-bh-n">{fmt(d.n)}</span>
      </div>
    ));
  }

  function Colunas({ dados: cols, cor }) {
    const mx = Math.max(...cols.map((d) => d.n), 1);
    return (
      <div className="pn-cols">
        {cols.map((d) => (
          <div className={`pn-cv ${d.rotulo === "Sem data" ? "dim" : ""}`} key={d.rotulo} title={`${d.rotulo}: ${fmt(d.n)} (${pc(d.n)})`}>
            <span className="pn-cv-pct">{pc(d.n)}</span>
            <span className="pn-cv-barwrap">
              <span className="pn-cv-bar" style={{ height: `${Math.max((d.n / mx) * 100, 1.5)}%`, background: cor }} />
            </span>
            <span className="pn-cv-n">{fmt(d.n)}</span>
            <span className="pn-cv-rot">{d.rotulo}</span>
          </div>
        ))}
      </div>
    );
  }

  // famílias: as MAX_FAMILIAS maiores + "Outras (N)" (45 rótulos embolariam)
  const familias = (() => {
    if (!dados) return [];
    const cheia = dados.familia;
    if (cheia.length <= MAX_FAMILIAS) return cheia;
    const topo = cheia.slice(0, MAX_FAMILIAS);
    const resto = cheia.slice(MAX_FAMILIAS);
    return [...topo, { rotulo: `Outras (${resto.length} famílias)`, n: resto.reduce((s, d) => s + d.n, 0) }];
  })();

  const clt = dados?.tipo.find((t) => t.rotulo === "CLT") || { n: 0 };
  const pj = dados?.tipo.find((t) => t.rotulo === "PJ") || { n: 0 };
  const ativos = dados?.situacao.find((s) => s.rotulo === "Ativo") || { n: 0 };

  return (
    <div className="sol-shell">
      <HeroNav
        titulo="Painel"
        subtitulo="Indicadores do organograma — distribuição dos colaboradores por regional, vínculo, diretoria, situação, família, idade e tempo de casa"
        atual="painel"
      />

      <div className="pn-page">
        {erro && <div className="modal-alert"><AlertIcon size={16} /><div><b>{erro}</b></div></div>}
        {!erro && !dados && <div className="ar-vazio">Carregando indicadores...</div>}

        {dados && (
          <>
            <div className="pn-kpis">
              <div className="pn-kpi" style={{ "--ac": "#1F2937" }}>
                <em>Total de colaboradores</em><b>{fmt(total)}</b><small>ativos no organograma</small>
              </div>
              <div className="pn-kpi" style={{ "--ac": COR.teal }}>
                <em>Situação Ativo</em><b>{pc(ativos.n)}</b><small>{fmt(ativos.n)} colaboradores</small>
              </div>
              <div className="pn-kpi" style={{ "--ac": COR.blue }}>
                <em>CLT</em><b>{pc(clt.n)}</b><small>{fmt(clt.n)} colaboradores</small>
              </div>
              <div className="pn-kpi" style={{ "--ac": COR.coral }}>
                <em>PJ</em><b>{pc(pj.n)}</b><small>{fmt(pj.n)} prestadores</small>
              </div>
            </div>

            <div className="pn-grid">
              <div className="pn-card">
                <h2><i style={{ background: COR.teal }} />Colaboradores por Regional</h2>
                <p>% em destaque · quantidade como apoio</p>
                <BarrasH dados={dados.regional} cor={COR.teal} />
              </div>

              <div className="pn-card">
                <h2><i style={{ background: COR.blue }} />Tipo de Contratação</h2>
                <p>vínculo CLT × PJ</p>
                <div className="pn-tipos">
                  <div className="pn-tipo">
                    <em><span className="pn-sw" style={{ background: COR.blue }} />CLT</em>
                    <b>{pc(clt.n)}</b><small>{fmt(clt.n)} colaboradores</small>
                  </div>
                  <div className="pn-tipo">
                    <em><span className="pn-sw" style={{ background: COR.coral }} />PJ</em>
                    <b>{pc(pj.n)}</b><small>{fmt(pj.n)} prestadores</small>
                  </div>
                </div>
                <div className="pn-meter">
                  <i style={{ width: `${(clt.n / (total || 1)) * 100}%`, background: COR.blue }} />
                  <i style={{ width: `${(pj.n / (total || 1)) * 100}%`, background: COR.coral }} />
                </div>
              </div>

              <div className="pn-card">
                <h2><i style={{ background: COR.ame }} />Colaboradores por Diretoria</h2>
                <p>soma das áreas de cada diretoria (igual à tela Diretorias)</p>
                <BarrasH dados={dados.diretoria} cor={COR.ame} />
              </div>

              <div className="pn-card">
                <h2><i style={{ background: COR.teal }} />Situação do Colaborador</h2>
                <p>status atual (DP)</p>
                <BarrasH dados={dados.situacao} cor={COR.teal} />
              </div>

              <div className="pn-card full">
                <h2><i style={{ background: COR.coral }} />Família do Nível Hierárquico</h2>
                <p>{MAX_FAMILIAS} maiores famílias · demais agrupadas em &quot;Outras&quot; ({dados.familia.length} no total)</p>
                <BarrasH dados={familias} cor={COR.coral} />
              </div>

              <div className="pn-card full">
                <h2><i style={{ background: COR.blue }} />Faixa Etária</h2>
                <p>ordem crescente de idade · % em destaque, quantidade como apoio</p>
                <Colunas dados={dados.idade} cor={COR.blue} />
              </div>

              <div className="pn-card full">
                <h2><i style={{ background: COR.amber }} />Tempo de Empresa</h2>
                <p>ordem crescente de tempo de casa</p>
                <Colunas dados={dados.tempo} cor={COR.amber} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
