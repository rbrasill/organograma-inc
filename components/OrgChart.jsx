"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PESSOAS, AREA, NIVEIS, nivelDe, inconsistenciasDe,
  construirArvore, normalizar,
} from "@/data/ti";
import {
  UserIcon, PinIcon, CheckIcon, CloseIcon, GridIcon,
  ChevronIcon, SearchIcon, FullscreenIcon, AlertIcon,
} from "@/components/icons";
import PersonModal from "@/components/PersonModal";

function Card({ node, byId, collapsed, onToggle, onOpen, highlight }) {
  const nivel = nivelDe(node.cargo);
  const cor = NIVEIS[nivel - 1].cor;
  const kids = node.children ? node.children.length : 0;
  const alertas = inconsistenciasDe(node, byId);
  return (
    <div
      id={`card-${node.id}`}
      className={`card ${highlight ? "hl" : ""}`}
      style={{ "--lvl": cor }}
      onClick={() => onOpen(node)}
    >
      {alertas.length > 0 && (
        <span className="alert" title={alertas.join(" · ")}><AlertIcon size={14} /></span>
      )}
      <div className="card-top">
        <div className="ava"><UserIcon /></div>
        <div className="who">
          <div className="nm">{node.nome}</div>
          {node.cargo
            ? <div className="cg">{node.cargo}</div>
            : <div className="cg empty">Cargo a definir</div>}
        </div>
      </div>
      <div className="card-foot">
        <div className="loc"><PinIcon /><span>{node.local}</span></div>
        <span className="dot" />
      </div>
      {kids > 0 && (
        <button
          className={`toggle ${collapsed ? "off" : ""}`}
          onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
          title={collapsed ? "Expandir equipe" : "Recolher equipe"}
        >
          <span className="tct">{kids}</span>
          <ChevronIcon size={13} />
        </button>
      )}
    </div>
  );
}

function LeafCards({ nodes, rest }) {
  return (
    <div className="leaf-grid">
      {nodes.map((c) => (
        <Card
          key={c.id}
          node={c}
          byId={rest.byId}
          collapsed={false}
          onToggle={rest.onToggle}
          onOpen={rest.onOpen}
          highlight={rest.highlightId === c.id}
        />
      ))}
    </div>
  );
}

function TreeNode({ node, rest }) {
  const collapsed = rest.collapsedSet.has(node.id);
  const kids = node.children || [];
  const hasKids = kids.length > 0;
  const branches = kids.filter((c) => (c.children || []).length > 0);
  const leaves = kids.filter((c) => (c.children || []).length === 0);
  const soloGrid = branches.length === 0 && leaves.length > 3;

  return (
    <li>
      <Card
        node={node}
        byId={rest.byId}
        collapsed={collapsed}
        onToggle={rest.onToggle}
        onOpen={rest.onOpen}
        highlight={rest.highlightId === node.id}
      />
      {hasKids && !collapsed && (
        <ul>
          {!soloGrid && branches.map((c) => (
            <TreeNode key={c.id} node={c} rest={rest} />
          ))}
          {leaves.length > 0 && (
            <li className="leaf-holder">
              <LeafCards nodes={leaves} rest={rest} />
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

export default function OrgChart() {
  const [pessoas, setPessoas] = useState(PESSOAS);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);
  const [collapsedSet, setCollapsedSet] = useState(new Set());
  const [highlightId, setHighlightId] = useState(null);
  const [showSug, setShowSug] = useState(false);
  const boxRef = useRef(null);
  const scrollRef = useRef(null);
  const treeRef = useRef(null);
  const [fit, setFit] = useState({ scale: 1, h: undefined });

  const { roots, byId } = useMemo(() => construirArvore(pessoas), [pessoas]);
  const root = roots[0];

  useEffect(() => {
    function h(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setShowSug(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    function recompute() {
      const c = scrollRef.current, t = treeRef.current;
      if (!c || !t) return;
      const natW = t.scrollWidth;
      const natH = t.scrollHeight;
      const avail = c.clientWidth;
      const scale = Math.min(1, avail / (natW || 1));
      setFit({ scale, h: natH * scale });
    }
    recompute();
    const ro = new ResizeObserver(() => recompute());
    if (scrollRef.current) ro.observe(scrollRef.current);
    window.addEventListener("resize", recompute);
    const t = setTimeout(recompute, 140);
    return () => { ro.disconnect(); window.removeEventListener("resize", recompute); clearTimeout(t); };
  }, [pessoas, collapsedSet]);

  const sugestoes = useMemo(() => {
    const q = normalizar(query.trim());
    if (q.length < 2) return [];
    return pessoas
      .filter((p) => normalizar(p.nome).includes(q) || normalizar(p.cargo).includes(q))
      .slice(0, 6);
  }, [query, pessoas]);

  function onToggle(id) {
    setCollapsedSet((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function irPara(p) {
    setCollapsedSet((prev) => {
      const n = new Set(prev);
      let cur = p;
      while (cur && cur.lider) { n.delete(cur.lider); cur = byId[cur.lider]; }
      return n;
    });
    setQuery(p.nome);
    setShowSug(false);
    setHighlightId(p.id);
    setTimeout(() => {
      const el = document.getElementById(`card-${p.id}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }, 80);
    setTimeout(() => setHighlightId(null), 2600);
  }

  const rest = { byId, collapsedSet, onToggle, onOpen: (n) => setOpenId(n.id), highlightId };
  const aberta = openId ? byId[openId] : null;

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">
          <div className="logo">INC</div>
          <div>
            <h1>Portal de Organograma</h1>
            <p>INC Empreendimentos</p>
          </div>
        </div>
        <div className="controls">
          <div className="select">
            <GridIcon /> Área: <b>{AREA}</b> <ChevronIcon />
          </div>
          <div className="search" ref={boxRef}>
            <SearchIcon />
            <input
              placeholder="Buscar pessoa..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowSug(true); }}
              onFocus={() => setShowSug(true)}
            />
            {showSug && sugestoes.length > 0 && (
              <div className="sug">
                {sugestoes.map((p) => (
                  <button key={p.id} className="sug-item" onClick={() => irPara(p)}>
                    <span className="si-ava"><UserIcon size={16} /></span>
                    <span className="si-txt">
                      <b>{p.nome}</b>
                      <em>{p.cargo || "Cargo a definir"} · {AREA}</em>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="board-shell">
        <div className="board">
          <div className="board-head">
            <div className="title-wrap">
              <span className="eyebrow">Organograma da área</span>
              <h2>{AREA}</h2>
              <p className="subline">
                {pessoas.length} pessoas &nbsp;·&nbsp; Líder da área: <b>{root.nome}</b> &nbsp;·&nbsp; Última validação: <b>pendente</b>
              </p>
            </div>
            <div className="actions">
              <button className="btn btn-ghost"><span className="ic"><CloseIcon /></span>Solicitar ajuste</button>
              <button className="btn btn-primary"><span className="ic"><CheckIcon /></span>Validar organograma</button>
              <button className="icon-btn" title="Tela cheia"><FullscreenIcon /></button>
            </div>
          </div>

          <div className="tree-scroll" ref={scrollRef} style={{ height: fit.h }}>
            <div className="tree" ref={treeRef} style={{ transform: `scale(${fit.scale})`, transformOrigin: "top center" }}>
              <ul>
                <TreeNode node={root} rest={rest} />
              </ul>
            </div>
          </div>

          <div className="legend">
            <span className="lg-title">Nível hierárquico</span>
            {NIVEIS.map((lv) => (
              <span className="chip" key={lv.n}><i style={{ background: lv.cor }} />{lv.label}</span>
            ))}
            <span className="chip" style={{ marginLeft: "auto" }}>
              <span className="alert stat"><AlertIcon size={13} /></span> Inconsistência
            </span>
          </div>
        </div>
      </div>

      {aberta && (
        <PersonModal
          pessoa={aberta}
          pessoas={pessoas}
          byId={byId}
          onClose={() => setOpenId(null)}
          onSalvar={(atual) => setPessoas((prev) => prev.map((p) => (p.id === atual.id ? { ...p, ...atual } : p)))}
        />
      )}
    </div>
  );
}
