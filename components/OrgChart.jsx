"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PESSOAS, AREA, NIVEIS, nivelDe, inconsistenciasDe,
  construirArvore, normalizar,
} from "@/data/ti";
import {
  UserIcon, PinIcon, CheckIcon, CloseIcon, GridIcon,
  ChevronIcon, SearchIcon, FullscreenIcon, AlertIcon,
  PlusIcon, MinusIcon, TargetIcon, UploadIcon,
} from "@/components/icons";
import PersonModal from "@/components/PersonModal";
import ImportModal from "@/components/ImportModal";

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

// divide as folhas em colunas verticais (equipes grandes),
// mantendo todas conectadas por linhas: gancho no topo de cada
// coluna + fio vertical entre os cards da coluna
function dividirEmColunas(leaves) {
  const numCols = Math.min(4, Math.ceil(leaves.length / 4));
  const porCol = Math.ceil(leaves.length / numCols);
  const cols = [];
  for (let i = 0; i < leaves.length; i += porCol) cols.push(leaves.slice(i, i + porCol));
  return cols;
}

function TreeNode({ node, rest }) {
  const collapsed = rest.collapsedSet.has(node.id);
  const kids = node.children || [];
  const hasKids = kids.length > 0;
  const branches = kids.filter((c) => (c.children || []).length > 0);
  const leaves = kids.filter((c) => (c.children || []).length === 0);
  const emColunas = leaves.length > 4;

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
          {branches.map((c) => (
            <TreeNode key={c.id} node={c} rest={rest} />
          ))}
          {!emColunas && leaves.map((c) => (
            <li key={c.id}>
              <Card
                node={c}
                byId={rest.byId}
                collapsed={false}
                onToggle={rest.onToggle}
                onOpen={rest.onOpen}
                highlight={rest.highlightId === c.id}
              />
            </li>
          ))}
          {emColunas && dividirEmColunas(leaves).map((col, i) => (
            <li key={`col-${i}`}>
              <div className="leaf-col">
                {col.map((c) => (
                  <div className="leaf-item" key={c.id}>
                    <Card
                      node={c}
                      byId={rest.byId}
                      collapsed={false}
                      onToggle={rest.onToggle}
                      onOpen={rest.onOpen}
                      highlight={rest.highlightId === c.id}
                    />
                  </div>
                ))}
              </div>
            </li>
          ))}
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
  const [showImport, setShowImport] = useState(false);
  const boxRef = useRef(null);
  const viewportRef = useRef(null);
  const treeRef = useRef(null);

  // pan & zoom: posição (x,y) e escala do organograma dentro do viewport
  const [view, setView] = useState({ x: 0, y: 24, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const viewRef = useRef(view);
  const dragRef = useRef(null);
  const justDraggedRef = useRef(false);

  useEffect(() => { viewRef.current = view; }, [view]);

  const { roots, byId } = useMemo(() => construirArvore(pessoas), [pessoas]);
  const root = roots[0];

  useEffect(() => {
    function h(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setShowSug(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // centraliza o organograma no viewport (usado no carregamento e no botão "Centralizar")
  function centerView() {
    const vp = viewportRef.current, t = treeRef.current;
    if (!vp || !t) return;
    const natW = t.scrollWidth || 1;
    const natH = t.scrollHeight || 1;
    const availW = vp.clientWidth, availH = vp.clientHeight;
    const scale = Math.min(1, availW / natW, availH / natH);
    setView({
      x: (availW - natW * scale) / 2,
      y: Math.max(24, (availH - natH * scale) / 2),
      scale,
    });
  }

  useEffect(() => {
    centerView();
    const t = setTimeout(centerView, 140); // após fontes/layout estabilizarem
    const ro = new ResizeObserver(() => centerView());
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => { ro.disconnect(); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoas]);

  // zoom com a roda do mouse, ancorado no cursor
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    function onWheel(e) {
      e.preventDefault();
      const v = viewRef.current;
      const rect = vp.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const scale = Math.min(2, Math.max(0.25, v.scale * factor));
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      setView({
        x: mx - ((mx - v.x) / v.scale) * scale,
        y: my - ((my - v.y) / v.scale) * scale,
        scale,
      });
    }
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, []);

  function zoomBy(factor) {
    const vp = viewportRef.current;
    if (!vp) return;
    const v = viewRef.current;
    const scale = Math.min(2, Math.max(0.25, v.scale * factor));
    const cx = vp.clientWidth / 2, cy = vp.clientHeight / 2;
    setView({
      x: cx - ((cx - v.x) / v.scale) * scale,
      y: cy - ((cy - v.y) / v.scale) * scale,
      scale,
    });
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y, moved: false };
  }
  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      d.moved = true;
      // só captura o ponteiro quando o arraste começa de fato,
      // para não roubar o clique dos cards e botões de expandir/recolher
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    if (d.moved) setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
  }
  function onPointerUp() {
    if (dragRef.current?.moved) justDraggedRef.current = true;
    dragRef.current = null;
    setDragging(false);
  }
  // após arrastar, engole o clique para não abrir o modal sem querer
  function onClickCapture(e) {
    if (justDraggedRef.current) {
      e.stopPropagation();
      e.preventDefault();
      justDraggedRef.current = false;
    }
  }

  // move a visão até deixar o card da pessoa no centro do viewport
  function focarPessoa(id) {
    const el = document.getElementById(`card-${id}`);
    const vp = viewportRef.current, t = treeRef.current;
    if (!el || !vp || !t) return;
    const v = viewRef.current;
    const tRect = t.getBoundingClientRect();
    const cRect = el.getBoundingClientRect();
    const cx = (cRect.left - tRect.left + cRect.width / 2) / v.scale;
    const cy = (cRect.top - tRect.top + cRect.height / 2) / v.scale;
    setView({ ...v, x: vp.clientWidth / 2 - cx * v.scale, y: vp.clientHeight / 2 - cy * v.scale });
  }

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
    setTimeout(() => focarPessoa(p.id), 120);
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
          {/* funcionalidade temporária até as integrações com o DP */}
          <button className="btn btn-import" onClick={() => setShowImport(true)} title="Subir a base por Excel para o banco de dados">
            <span className="ic"><UploadIcon size={13} /></span>Importar Excel
          </button>
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

          <div
            className={`tree-viewport ${dragging ? "dragging" : ""}`}
            ref={viewportRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClickCapture={onClickCapture}
          >
            <div className="tree-tools" onPointerDown={(e) => e.stopPropagation()}>
              <button className="icon-btn" onClick={() => zoomBy(1.2)} title="Aproximar"><PlusIcon /></button>
              <button className="icon-btn" onClick={() => zoomBy(1 / 1.2)} title="Afastar"><MinusIcon /></button>
              <button className="icon-btn" onClick={centerView} title="Centralizar organograma"><TargetIcon /></button>
            </div>
            <div className="pan-hint">Arraste para navegar · role para dar zoom</div>
            <div className="tree" ref={treeRef} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
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

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}

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
