"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { NIVEIS, nivelDe, inconsistenciasDe, construirArvore, normalizar } from "@/data/ti";
import {
  UserIcon, PinIcon, CheckIcon, CloseIcon, GridIcon,
  ChevronIcon, SearchIcon, FullscreenIcon, AlertIcon,
  PlusIcon, MinusIcon, TargetIcon, UploadIcon, DownloadIcon, InboxIcon, PencilIcon,
} from "@/components/icons";
import PersonModal from "@/components/PersonModal";
import ImportModal from "@/components/ImportModal";
import AreaModal from "@/components/AreaModal";

// nível visual (cor/legenda): usa a ordem do banco quando o cargo tem nível
// vinculado; senão deriva do nome do cargo (fallback até a curadoria)
const ORDEM_PARA_NIVEL = { 1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 3, 7: 4, 8: 4, 9: 5, 10: 6 };
function nivelVisual(node) {
  if (node.nivelOrdem && ORDEM_PARA_NIVEL[node.nivelOrdem]) return ORDEM_PARA_NIVEL[node.nivelOrdem];
  return nivelDe(node.cargo);
}

function Card({ node, byId, collapsed, onToggle, onOpen, highlight }) {
  const nivel = nivelVisual(node);
  const cor = NIVEIS[nivel - 1].cor;
  const kids = node.children ? node.children.length : 0;
  const alertas = inconsistenciasDe(node, byId);
  // raiz da área cujo líder real existe fora dela (ex.: responde a um
  // Diretor de outro setor) — mostra a ligação em vez de deixar "solto"
  const liderExterno = node.lider && !byId[node.lider] && node.liderNome ? node.liderNome : null;
  return (
    <div
      id={`card-${node.id}`}
      className={`card ${highlight ? "hl" : ""}`}
      style={{ "--lvl": cor }}
      onClick={() => onOpen(node)}
    >
      {liderExterno && (
        <div className="lider-externo" title={`Responde a ${liderExterno}, que está em outra área`}>
          ↑ Responde a <b>{liderExterno}</b> <em>(fora desta área)</em>
        </div>
      )}
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
        <div className="loc"><PinIcon /><span>{node.local || "—"}</span></div>
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
// mantendo todas conectadas por linhas
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
                node={c} byId={rest.byId} collapsed={false}
                onToggle={rest.onToggle} onOpen={rest.onOpen}
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
                      node={c} byId={rest.byId} collapsed={false}
                      onToggle={rest.onToggle} onOpen={rest.onOpen}
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
  // dados vindos do banco (API) — o mock data/ti.js não é mais a fonte
  const [pessoas, setPessoas] = useState([]);
  const [setores, setSetores] = useState([]);
  const [areaId, setAreaId] = useState(null);
  const [listas, setListas] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erroApi, setErroApi] = useState("");

  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);
  const [collapsedSet, setCollapsedSet] = useState(new Set());
  const [highlightId, setHighlightId] = useState(null);
  const [showSug, setShowSug] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAreas, setShowAreas] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const boxRef = useRef(null);
  const viewportRef = useRef(null);
  const treeRef = useRef(null);

  const carregar = useCallback(async (area) => {
    setCarregando(true);
    setErroApi("");
    try {
      const r = await fetch(`/api/organograma${area ? `?area=${encodeURIComponent(area)}` : ""}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Falha ao carregar o organograma.");
      setSetores(j.setores);
      setAreaId(j.areaId);
      setPessoas(j.pessoas);
      setListas(j.listas);
      setCollapsedSet(new Set());
      setQuery("");
    } catch (e) {
      setErroApi(e.message);
      setPessoas([]);
    }
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(null); }, [carregar]);

  // contador de solicitações pendentes para o badge do cabeçalho
  useEffect(() => {
    fetch("/api/solicitacoes?status=pendente")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setPendentes(j.pendentes); })
      .catch(() => {});
  }, []);

  const nomeArea = setores.find((s) => s.id === areaId)?.nome || "—";

  // pan & zoom
  const [view, setView] = useState({ x: 0, y: 24, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const viewRef = useRef(view);
  const dragRef = useRef(null);
  const justDraggedRef = useRef(false);

  useEffect(() => { viewRef.current = view; }, [view]);

  const { roots, byId } = useMemo(() => construirArvore(pessoas), [pessoas]);

  useEffect(() => {
    function h(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setShowSug(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

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
    const t = setTimeout(centerView, 140);
    const ro = new ResizeObserver(() => centerView());
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => { ro.disconnect(); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoas]);

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
  function onClickCapture(e) {
    if (justDraggedRef.current) {
      e.stopPropagation();
      e.preventDefault();
      justDraggedRef.current = false;
    }
  }

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

  // baixa o organograma COMPLETO da área em PNG de alta resolução:
  // expande tudo, captura a árvore no tamanho natural (sem o pan/zoom da
  // tela) e restaura o estado — mesmo árvores grandes saem inteiras
  async function baixarImagem() {
    const t = treeRef.current;
    if (!t || roots.length === 0 || baixando) return;
    setBaixando(true);
    const anterior = collapsedSet;
    setCollapsedSet(new Set()); // tudo expandido na imagem
    await new Promise((r) => setTimeout(r, 300)); // re-render + layout
    try {
      const natW = t.scrollWidth, natH = t.scrollHeight;
      // alta resolução, respeitando o limite de canvas dos navegadores (~16k px)
      const pixelRatio = Math.max(1, Math.min(3, Math.floor(16000 / Math.max(natW, natH)) || 1));
      const { toPng } = await import("html-to-image");
      const opcoes = {
        width: natW, height: natH, pixelRatio,
        backgroundColor: "#ffffff",
        style: { transform: "none", position: "static" },
      };
      let dataUrl;
      try {
        dataUrl = await toPng(t, opcoes);
      } catch {
        // fallback: sem embutir a fonte externa (ambientes com rede restrita)
        dataUrl = await toPng(t, { ...opcoes, fontEmbedCSS: "" });
      }
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `organograma-${normalizar(nomeArea).replace(/\s+/g, "-")}.png`;
      a.click();
    } finally {
      setCollapsedSet(anterior);
      setBaixando(false);
    }
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
  const liderArea = roots[0]?.nome || "—";

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
          {/* botões no cabeçalho (níveis de acesso virão depois) */}
          <Link href="/solicitacoes" className="btn btn-import btn-solic" title="Solicitações de ajuste recebidas pelo RH">
            <span className="ic"><InboxIcon size={13} /></span>Solicitações
            {pendentes > 0 && <span className="solic-badge">{pendentes}</span>}
          </Link>
          <Link href="/colaboradores" className="btn btn-import" title="Localizar e editar dados de um colaborador">
            <span className="ic"><PencilIcon size={13} /></span>Editar colaboradores
          </Link>
          <button className="btn btn-import" onClick={() => setShowImport(true)} title="Subir a base por Excel para o banco de dados">
            <span className="ic"><UploadIcon size={13} /></span>Importar Excel
          </button>
          <a className="btn btn-import" href="/api/colaboradores/exportar" title="Baixar toda a base de colaboradores em Excel (formato de importação)">
            <span className="ic"><DownloadIcon size={13} /></span>Exportar base
          </a>
          <button className="btn btn-import" onClick={() => setShowAreas(true)} title="Renomear e mesclar áreas">
            <span className="ic"><GridIcon size={13} /></span>Gerenciar áreas
          </button>
          <div className="select">
            <GridIcon /> Área:
            <select
              className="area-select"
              value={areaId || ""}
              onChange={(e) => carregar(e.target.value)}
              disabled={carregando || setores.length === 0}
            >
              {setores.length === 0 && <option value="">—</option>}
              {setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
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
                      <em>{p.cargo || "Cargo a definir"} · {nomeArea}</em>
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
              <h2>{nomeArea}</h2>
              <p className="subline">
                {pessoas.length} pessoas &nbsp;·&nbsp; Líder da área: <b>{liderArea}</b> &nbsp;·&nbsp; Última validação: <b>pendente</b>
              </p>
            </div>
            <div className="actions">
              <button
                className="btn btn-ghost btn-baixar"
                onClick={baixarImagem}
                disabled={baixando || roots.length === 0}
                title="Baixar o organograma completo da área em imagem de alta resolução"
              >
                <span className="ic"><DownloadIcon /></span>
                {baixando ? "Gerando imagem..." : "Baixar imagem"}
              </button>
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

            {carregando && <div className="tree-vazio">Carregando organograma...</div>}
            {!carregando && erroApi && (
              <div className="tree-vazio erro">
                <AlertIcon size={22} />
                <b>Não consegui ler o banco de dados</b>
                <em>{erroApi}</em>
              </div>
            )}
            {!carregando && !erroApi && roots.length === 0 && (
              <div className="tree-vazio">
                <b>Nenhum colaborador ativo nesta área</b>
                <em>Use o botão "Importar Excel" no topo para carregar a base.</em>
              </div>
            )}

            <div className="tree" ref={treeRef} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
              {roots.length > 0 && (
                <ul>
                  {roots.map((r) => <TreeNode key={r.id} node={r} rest={rest} />)}
                </ul>
              )}
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

      {showImport && (
        <ImportModal onClose={() => { setShowImport(false); carregar(areaId); }} />
      )}

      {showAreas && (
        <AreaModal onClose={() => setShowAreas(false)} onMudou={() => carregar(areaId)} />
      )}

      {aberta && (
        <PersonModal
          pessoa={aberta}
          pessoas={pessoas}
          byId={byId}
          listas={listas}
          areaAtual={nomeArea}
          onClose={() => setOpenId(null)}
          onSalvar={(atual) => setPessoas((prev) => prev.map((p) => (p.id === atual.id ? { ...p, ...atual } : p)))}
        />
      )}
    </div>
  );
}
