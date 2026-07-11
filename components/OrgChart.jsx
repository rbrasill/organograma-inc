"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HeroNav from "@/components/HeroNav";
import { NIVEIS, nivelDe, inconsistenciasDe, construirArvore, normalizar } from "@/data/ti";
import {
  UserIcon, PinIcon, CheckIcon, CloseIcon, GridIcon,
  SearchIcon, FullscreenIcon, AlertIcon,
  PlusIcon, MinusIcon, TargetIcon, DownloadIcon,
} from "@/components/icons";
import PersonModal from "@/components/PersonModal";
import ImportModal from "@/components/ImportModal";
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
// Usada para ORDENAR os filhos da esquerda (mais sênior) para a direita e
// para calcular o DEGRAU vertical entre irmãos de níveis diferentes.
const ordemDe = (n) => (n.nivelOrdem == null ? 99 : n.nivelOrdem);

// degrau vertical entre irmãos: quem tem nível mais baixo desce em relação
// ao irmão mais sênior, deixando visível que não são do mesmo nível mesmo
// respondendo ao mesmo líder. O degrau é por POSIÇÃO entre os níveis
// distintos do grupo (não pela distância absoluta), para não abrir buracos.
const DEGRAU_PX = 46;
function degrausDe(kids) {
  const ordens = [...new Set(kids.map(ordemDe))].sort((a, b) => a - b);
  return (n) => Math.min(ordens.indexOf(ordemDe(n)), 4) * DEGRAU_PX;
}

function Card({ node, byId, collapsed, onToggle, onOpen, highlight }) {
  // cor oficial da FAMÍLIA (nivel_hierarquico.cor) quando existe; senão cai
  // no mapa de 6 faixas por ordem/nome do cargo (cargos sem nível vinculado).
  const cor = node.cor || NIVEIS[nivelVisual(node) - 1].cor;
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

// agrupa as folhas (quem não tem equipe) em FILEIRAS por nível hierárquico:
// mesmo nível = mesma fileira (cards lado a lado, alinhados); nível mais
// baixo = fileira abaixo. Fileiras muito largas quebram em blocos de até 5.
const MAX_POR_FILEIRA = 5;
function fileirasDeFolhas(leaves) {
  const porNivel = new Map();
  for (const f of leaves) {
    const o = ordemDe(f);
    if (!porNivel.has(o)) porNivel.set(o, []);
    porNivel.get(o).push(f);
  }
  const fileiras = [];
  for (const o of [...porNivel.keys()].sort((a, b) => a - b)) {
    const grupo = porNivel.get(o);
    for (let i = 0; i < grupo.length; i += MAX_POR_FILEIRA) {
      fileiras.push(grupo.slice(i, i + MAX_POR_FILEIRA));
    }
  }
  return fileiras;
}

function TreeNode({ node, rest, deg = 0 }) {
  const collapsed = rest.collapsedSet.has(node.id);

  // filhos ordenados por nível (mais sênior à esquerda), depois por nome.
  // Ramos (quem tem equipe) primeiro, folhas depois — todos ligados à mesma
  // barra, mas com DEGRAU vertical quando os níveis diferem (o mais sênior
  // fica mais alto; ver degrausDe).
  const kids = [...(node.children || [])].sort(
    (a, b) => ordemDe(a) - ordemDe(b) || a.nome.localeCompare(b.nome, "pt-BR")
  );
  const hasKids = kids.length > 0;
  const branches = kids.filter((c) => (c.children || []).length > 0);
  const leaves = kids.filter((c) => (c.children || []).length === 0);
  const fileiras = fileirasDeFolhas(leaves);
  const degDe = degrausDe(kids);

  return (
    <li style={{ "--deg": `${deg}px` }}>
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
            <TreeNode key={c.id} node={c} rest={rest} deg={degDe(c)} />
          ))}
          {/* uma única fileira de folhas: cards direto na barra (clássico) */}
          {fileiras.length === 1 && fileiras[0].map((c) => (
            <li key={c.id} style={{ "--deg": `${degDe(c)}px` }}>
              <Card
                node={c} byId={rest.byId} collapsed={false}
                onToggle={rest.onToggle} onOpen={rest.onOpen}
                highlight={rest.highlightId === c.id}
              />
            </li>
          ))}
          {/* níveis diferentes: pilha de fileiras — mesma fileira = mesmo
              nível (lado a lado); fileiras seguintes pendem da de cima */}
          {fileiras.length > 1 && (
            <li className="leaf-stack" style={{ "--deg": `${degDe(fileiras[0][0])}px` }}>
              {fileiras.map((row, i) => (
                <ul className="leaf-row" key={i}>
                  {row.map((c) => (
                    <li key={c.id}>
                      <Card
                        node={c} byId={rest.byId} collapsed={false}
                        onToggle={rest.onToggle} onOpen={rest.onOpen}
                        highlight={rest.highlightId === c.id}
                      />
                    </li>
                  ))}
                </ul>
              ))}
            </li>
          )}
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
  const [liderAreaAlvo, setLiderAreaAlvo] = useState(null); // card do líder externo aberto
  const [baixando, setBaixando] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
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

  // vindo de outra página com ?abrir=importar|areas → abre o modal direto
  useEffect(() => {
    const abrir = new URLSearchParams(window.location.search).get("abrir");
    if (abrir === "importar") setShowImport(true);
    if (abrir) window.history.replaceState(null, "", "/");
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

  // tela cheia: ESC fecha; recentraliza ao entrar/sair (o viewport muda de
  // tamanho e o ResizeObserver já dispara centerView, mas garantimos aqui)
  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e) { if (e.key === "Escape") setFullscreen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);
  useEffect(() => {
    const t = setTimeout(() => centerView(), 130);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

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
      const cor = p.cor || NIVEIS[nivelVisual(p) - 1].cor;
      map.set(fam, { familia: fam, ordem: p.nivelOrdem ?? 999, cor });
    }
    return [...map.values()].sort(
      (a, b) => a.ordem - b.ordem || a.familia.localeCompare(b.familia, "pt-BR")
    );
  }, [pessoas]);

  return (
    <div className="shell">
      {/* banner "hero" global: logo + título + menu de funcionalidades */}
      <HeroNav
        titulo="Organograma INC"
        subtitulo="Visualize e gerencie a estrutura organizacional da empresa."
        atual="home"
        onAcao={(k) => { if (k === "importar") setShowImport(true); }}
      />

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

      <div className={`board-shell ${fullscreen ? "fs" : ""}`}>
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
              <button
                className={`icon-btn ${fullscreen ? "on" : ""}`}
                onClick={() => setFullscreen((v) => !v)}
                title={fullscreen ? "Sair da tela cheia (Esc)" : "Ver em tela cheia"}
              >
                {fullscreen ? <CloseIcon /> : <FullscreenIcon />}
              </button>
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
                    <TreeNode key={r.id} node={r} rest={rest} deg={degrausDe(rootsOrdenadas)(r)} />
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
