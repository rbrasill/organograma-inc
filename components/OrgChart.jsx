"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { NIVEIS, nivelDe, inconsistenciasDe, construirArvore, normalizar } from "@/data/ti";
import {
  UserIcon, PinIcon, CheckIcon, CloseIcon, GridIcon,
  SearchIcon, FullscreenIcon, AlertIcon,
  PlusIcon, MinusIcon, TargetIcon, UploadIcon, DownloadIcon, InboxIcon, PencilIcon, MergeIcon,
} from "@/components/icons";
import PersonModal from "@/components/PersonModal";
import ImportModal from "@/components/ImportModal";
import AreaModal from "@/components/AreaModal";
import LiderAreaModal from "@/components/LiderAreaModal";

// nível visual (cor da faixa/legenda): mapeia a ORDEM do banco (1 = topo,
// 18 = base, base v2) para as 6 faixas de cor, num gradiente por hierarquia.
// Cargos sem nível vinculado caem no fallback pelo nome do cargo.
//   1–4  direção (Presidente, Conselheiro, CFO, Diretor)
//   5–7  gerência (Vice-Diretor, Gerente)
//   8–10 liderança tática (Coordenador/Head/Gestor, Supervisor, Encarregado)
//   11–13 especialista/técnico (Eng., Adv., Analista, operacional qualificado)
//   14–15 apoio (Assistente, Auxiliar)
//   16–18 base (Estagiário, Aprendiz, Servente)
const ORDEM_PARA_NIVEL = {
  1: 1, 2: 1, 3: 1, 4: 1,
  5: 2, 6: 2, 7: 2,
  8: 3, 9: 3, 10: 3,
  11: 4, 12: 4, 13: 4,
  14: 5, 15: 5,
  16: 6, 17: 6, 18: 6,
};
function nivelVisual(node) {
  if (node.nivelOrdem && ORDEM_PARA_NIVEL[node.nivelOrdem]) return ORDEM_PARA_NIVEL[node.nivelOrdem];
  return nivelDe(node.cargo);
}

// ordem do nível hierárquico do banco (1 = topo); sem nível vai para o fim.
// Usada só para ORDENAR os filhos da esquerda (mais sênior) para a direita —
// todos os irmãos ficam na mesma linha (árvore clássica, sem degraus).
const ordemDe = (n) => (n.nivelOrdem == null ? 99 : n.nivelOrdem);

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
      {node.externo && (
        <div className="lider-externo chefe" title={`Líder desta área — pertence à área ${node.setorOrigem || "—"}`}>
          Líder da área <em>· vem de {node.setorOrigem || "outra área"}</em>
        </div>
      )}
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
        {node.pj && <span className="pj-tag" title="Prestador de serviço — contratação PJ">PJ</span>}
        <span className="dot" />
      </div>
      {kids > 0 && (
        <button
          className={`toggle ${collapsed ? "off" : ""}`}
          onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
          title={collapsed ? `Expandir equipe (${kids})` : "Recolher equipe"}
        >
          {collapsed ? <PlusIcon size={13} /> : <MinusIcon size={13} />}
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

  // filhos ordenados por nível (mais sênior à esquerda), depois por nome.
  // Ramos (quem tem equipe) primeiro, folhas depois — mas todos na MESMA
  // linha horizontal, ligados pela mesma barra (árvore clássica).
  const kids = [...(node.children || [])].sort(
    (a, b) => ordemDe(a) - ordemDe(b) || a.nome.localeCompare(b.nome, "pt-BR")
  );
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
  const [resultadosBusca, setResultadosBusca] = useState([]); // busca em toda a base
  const [buscando, setBuscando] = useState(false);
  const focoPendenteRef = useRef(null); // matrícula a focar após trocar de área
  const [openId, setOpenId] = useState(null);
  const [collapsedSet, setCollapsedSet] = useState(new Set());
  const [highlightId, setHighlightId] = useState(null);
  const [showSug, setShowSug] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAreas, setShowAreas] = useState(false);
  const [liderAreaAlvo, setLiderAreaAlvo] = useState(null); // card do líder externo aberto
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

  // busca de pessoa em TODA a base (não só na área carregada), com debounce
  useEffect(() => {
    const q = query.trim();
    if (!showSug || q.length < 2) { setResultadosBusca([]); return; }
    let ativo = true;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/colaboradores?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        if (ativo) setResultadosBusca(j.ok ? j.resultados : []);
      } catch { if (ativo) setResultadosBusca([]); }
      if (ativo) setBuscando(false);
    }, 250);
    return () => { ativo = false; clearTimeout(t); };
  }, [query, showSug]);

  function onToggle(id) {
    setCollapsedSet((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  // expande a cadeia até a pessoa, destaca e centraliza nela
  const focarEExpandir = useCallback((id) => {
    const alvo = byId[id];
    if (!alvo) return;
    setCollapsedSet((prev) => {
      const n = new Set(prev);
      let cur = alvo;
      while (cur && cur.lider) { n.delete(cur.lider); cur = byId[cur.lider]; }
      return n;
    });
    setHighlightId(id);
    setTimeout(() => focarPessoa(id), 140);
    setTimeout(() => setHighlightId(null), 3000);
  }, [byId]);

  // clique num resultado da busca: abre a área da pessoa (trocando o seletor)
  // e, quando os dados chegam, foca nela. Se já estiver na área carregada,
  // foca direto.
  function irParaPessoa(res) {
    setShowSug(false);
    setResultadosBusca([]);
    setQuery("");
    if (byId[res.matricula]) {
      focoPendenteRef.current = null;
      focarEExpandir(res.matricula);
      return;
    }
    focoPendenteRef.current = res.matricula;
    carregar(res.setorId || null);
  }

  // quando a área nova termina de carregar (byId muda), foca a pessoa pendente
  useEffect(() => {
    const id = focoPendenteRef.current;
    if (!id || !byId[id]) return;
    focoPendenteRef.current = null;
    // espera o auto-centralizar (≈140ms) acontecer antes de focar na pessoa
    const t = setTimeout(() => focarEExpandir(id), 360);
    return () => clearTimeout(t);
  }, [byId, focarEExpandir]);

  // card do líder externo abre o modal da ÁREA (troca em massa);
  // os demais abrem o modal normal do colaborador
  const rest = {
    byId, collapsedSet, onToggle, highlightId,
    onOpen: (n) => (n.externo ? setLiderAreaAlvo(n) : setOpenId(n.id)),
  };
  const aberta = openId ? byId[openId] : null;

  // raízes ordenadas por nível (o líder externo, de nível mais alto, fica à
  // frente) e com degraus verticais quando os níveis diferem
  const rootsOrdenadas = useMemo(
    () => [...roots].sort((a, b) => ordemDe(a) - ordemDe(b) || a.nome.localeCompare(b.nome, "pt-BR")),
    [roots]
  );

  // líder da área = o líder externo (âncora) quando existe; senão a raiz de
  // nível mais alto da própria área
  const liderArea = rootsOrdenadas.find((r) => r.externo)?.nome || rootsOrdenadas[0]?.nome || "—";
  const totalArea = pessoas.filter((p) => !p.externo).length;

  // legenda dinâmica: só as FAMÍLIAS de cargo (nome abreviado — Diretor,
  // Analista, Auxiliar...) presentes nesta área, cada uma com a cor do seu
  // card. Ordenadas pelo nível (topo → base).
  const legenda = useMemo(() => {
    const map = new Map();
    for (const p of pessoas) {
      const fam = (p.familia || "").trim() || "Sem nível definido";
      if (map.has(fam)) continue;
      const lvl = nivelVisual(p);
      map.set(fam, { familia: fam, ordem: p.nivelOrdem ?? 999, cor: NIVEIS[lvl - 1].cor });
    }
    return [...map.values()].sort(
      (a, b) => a.ordem - b.ordem || a.familia.localeCompare(b.familia, "pt-BR")
    );
  }, [pessoas]);

  return (
    <div className="shell">
      {/* banner "hero": logo + título à esquerda; cards das funcionalidades à direita */}
      <div className="hero">
        <div className="hero-brand">
          <img className="hero-logo" src="/inc-oficial.svg" alt="INC Empreendimentos" />
          <div className="hero-txt">
            <h1>Organograma INC</h1>
            <p>Visualize e gerencie a estrutura organizacional da empresa.</p>
          </div>
        </div>
        <div className="hero-cards">
          <Link href="/solicitacoes" className="hero-card" title="Solicitações de ajuste recebidas pelo RH">
            <span className="hc-ic"><InboxIcon size={17} /></span>
            <span className="hc-nome">Solicitações{pendentes > 0 && <i className="hc-badge">{pendentes}</i>}</span>
          </Link>
          <Link href="/colaboradores" className="hero-card" title="Localizar e editar dados de colaboradores">
            <span className="hc-ic"><PencilIcon size={17} /></span>
            <span className="hc-nome">Editar colaboradores</span>
          </Link>
          <Link href="/lideres" className="hero-card" title="Diretores, áreas e troca de líder">
            <span className="hc-ic"><UserIcon size={17} /></span>
            <span className="hc-nome">Líderes por área</span>
          </Link>
          <button className="hero-card" onClick={() => setShowImport(true)} title="Subir a base oficial por Excel">
            <span className="hc-ic"><UploadIcon size={17} /></span>
            <span className="hc-nome">Importar Excel</span>
          </button>
          <a className="hero-card" href="/api/colaboradores/exportar" title="Baixar toda a base em Excel">
            <span className="hc-ic"><DownloadIcon size={17} /></span>
            <span className="hc-nome">Exportar base</span>
          </a>
          <button className="hero-card" onClick={() => setShowAreas(true)} title="Renomear e mesclar áreas">
            <span className="hc-ic"><MergeIcon size={17} /></span>
            <span className="hc-nome">Gerenciar áreas</span>
          </button>
          <Link href="/catalogos" className="hero-card" title="Cargos, níveis, locais, regionais e situações">
            <span className="hc-ic"><GridIcon size={17} /></span>
            <span className="hc-nome">Catálogos</span>
          </Link>
        </div>
      </div>

      {/* controles do dia a dia: escolher a área e buscar pessoa */}
      <div className="controls-bar">
        <div className="select">
          <GridIcon /> Área:
          <select
            className="area-select"
            value={areaId || ""}
            onChange={(e) => carregar(e.target.value || null)}
            disabled={carregando || setores.length === 0}
          >
            <option value="">Selecione uma área...</option>
            {setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
        <div className="search" ref={boxRef}>
          <SearchIcon />
          <input
            placeholder="Buscar pessoa em toda a base..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowSug(true); }}
            onFocus={() => setShowSug(true)}
          />
          {showSug && query.trim().length >= 2 && (
            <div className="sug sug-busca">
              {resultadosBusca.map((p) => (
                <button key={p.matricula} className="sug-item" onClick={() => irParaPessoa(p)}>
                  <span className="si-ava"><UserIcon size={16} /></span>
                  <span className="si-txt">
                    <b>{p.nome}</b>
                    <em>{p.cargo || "Cargo a definir"}{p.setor ? ` · ${p.setor}` : ""}</em>
                  </span>
                </button>
              ))}
              {buscando && <div className="sug-vazio">Buscando...</div>}
              {!buscando && resultadosBusca.length === 0 && (
                <div className="sug-vazio">Nenhuma pessoa encontrada.</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="board-shell">
        <div className="board">
          <div className="board-head">
            <div className="title-wrap">
              <span className="eyebrow">Organograma da área</span>
              <h2>{areaId ? nomeArea : "Selecione uma área"}</h2>
              {areaId ? (
                <p className="subline">
                  {totalArea} pessoas &nbsp;·&nbsp; Líder da área: <b>{liderArea}</b> &nbsp;·&nbsp; Última validação: <b>pendente</b>
                </p>
              ) : (
                <p className="subline">
                  Escolha uma área no seletor acima — ou busque uma pessoa para abrir a área dela.
                </p>
              )}
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
            {!carregando && !erroApi && !areaId && (
              <div className="tree-vazio">
                <GridIcon size={22} />
                <b>Selecione uma área para começar</b>
                <em>Use o seletor "Área" acima, ou busque uma pessoa — o organograma abre direto na área dela.</em>
              </div>
            )}
            {!carregando && !erroApi && areaId && roots.length === 0 && (
              <div className="tree-vazio">
                <b>Nenhum colaborador ativo nesta área</b>
                <em>Abra o menu "Gerenciar" → "Importar Excel" para carregar a base.</em>
              </div>
            )}

            <div className="tree" ref={treeRef} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
              {roots.length > 0 && (
                <ul>
                  {rootsOrdenadas.map((r) => (
                    <TreeNode key={r.id} node={r} rest={rest} />
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="legend">
            <span className="lg-title">Famílias de cargo</span>
            {legenda.length === 0 ? (
              <span className="lg-vazio">aparecem conforme a área aberta</span>
            ) : (
              legenda.map((lv) => (
                <span className="chip" key={lv.familia}><i style={{ background: lv.cor }} />{lv.familia}</span>
              ))
            )}
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

      {liderAreaAlvo && (
        <LiderAreaModal
          lider={liderAreaAlvo}
          areaId={areaId}
          areaNome={nomeArea}
          qtdDiretos={pessoas.filter((p) => !p.externo && p.lider === liderAreaAlvo.id).length}
          onClose={() => setLiderAreaAlvo(null)}
          onTrocado={() => { setLiderAreaAlvo(null); carregar(areaId); }}
        />
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
