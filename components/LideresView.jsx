"use client";

// Líderes por área — visão agrupada por DIRETOR: cada diretor com as áreas
// que gerencia e o líder de cada área. "Alterar líder" abre um modal com as
// informações da área e do líder; a troca aplica na área INTEIRA (quem
// respondia ao antigo passa ao novo; o antigo vira subordinado do novo;
// novo líder da própria área herda o diretor).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  UserIcon, CheckIcon, CloseIcon, AlertIcon, ChevronIcon, SearchIcon,
} from "@/components/icons";

// tom leve e discreto por área/diretor (escolhido pelo nome, estável)
const TONS = 8;
function tomDe(nome) {
  let h = 0;
  for (const ch of nome || "") h = (h + ch.charCodeAt(0)) % 997;
  return `tone-${h % TONS}`;
}

export default function LideresView() {
  const [dados, setDados] = useState(null); // { diretores, semDiretor }
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  // modal de troca (uma área por vez)
  const [alvo, setAlvo] = useState(null); // { areaId, areaNome, pessoas, lider, diretorNome }
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [novo, setNovo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erroTroca, setErroTroca] = useState("");
  const buscaRef = useRef(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await fetch("/api/lideres");
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Falha ao carregar.");
      setDados(j);
    } catch (e) { setErro(e.message); setDados(null); }
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // busca do novo líder (todas as áreas), com debounce
  useEffect(() => {
    if (!alvo || novo) return;
    let ativo = true;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/colaboradores?q=${encodeURIComponent(busca)}&excluir=${encodeURIComponent(alvo.lider.matricula)}`);
        const j = await r.json();
        if (ativo) setResultados(j.ok ? j.resultados : []);
      } catch { if (ativo) setResultados([]); }
      if (ativo) setBuscando(false);
    }, 250);
    return () => { ativo = false; clearTimeout(t); };
  }, [busca, alvo, novo]);

  useEffect(() => {
    if (alvo && !novo && buscaRef.current) buscaRef.current.focus();
  }, [alvo, novo]);

  // Esc fecha o modal
  useEffect(() => {
    if (!alvo) return;
    function esc(e) { if (e.key === "Escape") fecharTroca(); }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo]);

  function abrirTroca(area, diretorNome) {
    setAlvo({
      areaId: area.id, areaNome: area.nome, pessoas: area.pessoas,
      lider: area.lider, diretorNome: diretorNome || "",
    });
    setBusca(""); setResultados([]); setNovo(null); setErroTroca(""); setMsg("");
  }
  function fecharTroca() {
    setAlvo(null); setNovo(null); setBusca(""); setErroTroca("");
  }

  async function confirmarTroca() {
    if (!alvo || !novo) return;
    setSalvando(true);
    setErroTroca("");
    try {
      const r = await fetch("/api/lideres", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "trocar", areaId: alvo.areaId,
          deMatricula: alvo.lider.matricula, paraMatricula: novo.matricula,
        }),
      });
      const txt = await r.text();
      let j; try { j = JSON.parse(txt); } catch { j = { ok: false, erro: `Servidor respondeu ${r.status}.` }; }
      if (!j.ok) { setErroTroca(j.erro || "Falha ao trocar o líder."); setSalvando(false); return; }
      setMsg(`Líder de ${alvo.areaNome} alterado para ${novo.nome}. ${j.reapontados} colaborador(es) reapontado(s)${j.antigoReaponta ? ` — ${alvo.lider.nome} agora responde ao novo líder` : ""}.`);
      fecharTroca();
      await carregar();
    } catch (e) { setErroTroca(`Falha: ${e.message}`); }
    setSalvando(false);
  }

  function CardArea({ area, diretorNome }) {
    return (
      <div className={`ld-card ${tomDe(area.nome)}`}>
        <div className="ld-area">
          <b>{area.nome}</b>
          <span className="ar-count">{area.pessoas} colab.</span>
        </div>

        <div className="lider-atual">
          <span className="la-ava"><UserIcon size={20} /></span>
          <span className="la-txt">
            <b>{area.lider.nome}</b>
            <em>{area.lider.cargo || "Cargo a definir"} · lidera {area.lider.diretos} direto(s)</em>
          </span>
          <button className="la-btn" onClick={() => abrirTroca(area, diretorNome)}>
            Alterar líder
          </button>
        </div>
        {area.outrosTopo > 0 && (
          <p className="ld-nota">+ {area.outrosTopo} pessoa(s) também no topo desta área (sem líder interno).</p>
        )}
      </div>
    );
  }

  return (
    <div className="sol-shell">
      <div className="sol-topbar">
        <div className="brand">
          <div className="logo">INC</div>
          <div>
            <h1>Líderes por área</h1>
            <p>Diretores, áreas sob sua gestão e o líder de cada área · a troca aplica na área inteira</p>
          </div>
        </div>
        <Link href="/" className="btn btn-neutral"><ChevronIcon size={13} /> Voltar ao organograma</Link>
      </div>

      <div className="ct-board">
        {erro && <div className="modal-alert"><AlertIcon size={16} /><div><b>{erro}</b></div></div>}
        {msg && <div className="modal-note sol-ok"><b>{msg}</b></div>}
        {carregando && <div className="ar-vazio">Carregando líderes...</div>}

        {!carregando && dados && dados.diretores.map((g) => (
          <section className="ld-grupo" key={g.diretor.matricula || g.diretor.nome}>
            <div className={`ld-dir ${tomDe(g.diretor.nome)}`}>
              <span className="ld-dir-ava"><UserIcon size={22} /></span>
              <span className="ld-dir-txt">
                <b>{g.diretor.nome}</b>
                <em>{g.diretor.cargo || "Cargo a definir"}{g.diretor.setor ? ` · ${g.diretor.setor}` : ""}</em>
              </span>
              <span className="ld-dir-chip">{g.areas.length} área(s) sob gestão</span>
            </div>
            <div className="ld-grid">
              {g.areas.map((a) => <CardArea key={a.id} area={a} diretorNome={g.diretor.nome} />)}
            </div>
          </section>
        ))}

        {!carregando && dados && dados.semDiretor.length > 0 && (
          <section className="ld-grupo">
            <div className="ld-dir topo">
              <span className="ld-dir-ava"><UserIcon size={22} /></span>
              <span className="ld-dir-txt">
                <b>Topo da hierarquia</b>
                <em>Áreas cujo líder não responde a ninguém (ex.: Presidência)</em>
              </span>
              <span className="ld-dir-chip">{dados.semDiretor.length} área(s)</span>
            </div>
            <div className="ld-grid">
              {dados.semDiretor.map((a) => <CardArea key={a.id} area={a} diretorNome="" />)}
            </div>
          </section>
        )}
      </div>

      {/* ===== modal de alterar líder ===== */}
      {alvo && (
        <div className="modal-overlay" onMouseDown={fecharTroca}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-x" onClick={fecharTroca} aria-label="Fechar"><CloseIcon size={16} /></button>

            <div className="modal-head">
              <div className={`ld-modal-ava ${tomDe(alvo.areaNome)}`}><UserIcon size={26} /></div>
              <div>
                <h3>Alterar líder — {alvo.areaNome}</h3>
                <p>A troca vale para todos os colaboradores da área</p>
              </div>
            </div>

            <div className="modal-body">
              {/* contexto da área e do líder atual */}
              <div className="ro-grid" style={{ marginBottom: 12 }}>
                <div className="ro"><span>Área</span><b>{alvo.areaNome}</b></div>
                <div className="ro"><span>Colaboradores</span><b>{alvo.pessoas}</b></div>
                <div className="ro"><span>Diretor</span><b>{alvo.diretorNome || "— (topo da hierarquia)"}</b></div>
                <div className="ro"><span>Respondem ao líder</span><b>{alvo.lider.diretos} direto(s)</b></div>
              </div>

              <div className="modal-section">
                <span className="sec-title">Líder atual</span>
                <div className={`lider-atual ${novo ? "trocado" : ""}`}>
                  <span className="la-ava"><UserIcon size={20} /></span>
                  <span className="la-txt">
                    <b>{novo ? novo.nome : alvo.lider.nome}</b>
                    <em>{novo
                      ? `${novo.cargo || "Cargo a definir"}${novo.setor ? ` · ${novo.setor}` : ""}`
                      : `${alvo.lider.cargo || "Cargo a definir"} · matrícula ${alvo.lider.matricula}`}</em>
                  </span>
                  {novo && (
                    <button className="la-btn undo" onClick={() => setNovo(null)}>Desfazer</button>
                  )}
                </div>
              </div>

              {!novo && (
                <div className="modal-section">
                  <span className="sec-title">Novo líder <em>(busca em todas as áreas)</em></span>
                  <div className="lider-pick">
                    <span className="lp-ic"><SearchIcon size={14} /></span>
                    <input
                      ref={buscaRef}
                      placeholder="Buscar pelo nome do novo líder..."
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                    />
                  </div>
                  <div className="lider-list ld-modal-lista">
                    {resultados.map((l) => (
                      <button key={l.matricula} className="ll-item" onClick={() => setNovo(l)}>
                        <b>{l.nome}</b><em>{(l.cargo || "Cargo a definir")}{l.setor ? ` · ${l.setor}` : ""}</em>
                      </button>
                    ))}
                    {buscando && <div className="ll-vazio">Buscando...</div>}
                    {!buscando && resultados.length === 0 && (
                      <div className="ll-vazio">{busca ? `Nenhuma pessoa encontrada para "${busca}"` : "Digite para buscar"}</div>
                    )}
                  </div>
                </div>
              )}

              {novo && (
                <div className="sol-confirma">
                  <b className="sol-titulo">Confirmar a troca</b>
                  <ul className="sol-diffs">
                    <li>
                      <span className="sol-campo">Líder</span>
                      <span className="sol-de">{alvo.lider.nome}</span>
                      <span className="sol-seta">→</span>
                      <span className="sol-para">{novo.nome}</span>
                    </li>
                  </ul>
                  <p className="sol-texto" style={{ marginTop: 8 }}>
                    <b>{alvo.lider.diretos}</b> colaborador(es) que respondem a {alvo.lider.nome} passam a
                    responder a <b>{novo.nome}</b>, e {alvo.lider.nome} passa a responder ao novo líder.{" "}
                    {novo.setor ? (novo.setor === alvo.areaNome
                      ? "Como o novo líder é da própria área, ele herda o diretor atual."
                      : `O novo líder é de ${novo.setor} — entra como líder externo (padrão diretor).`) : ""}
                  </p>
                </div>
              )}

              {erroTroca && <div className="modal-alert"><AlertIcon size={16} /><div><b>{erroTroca}</b></div></div>}
            </div>

            <div className="modal-foot">
              <button className="btn btn-neutral" onClick={fecharTroca}>Cancelar</button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-primary" disabled={!novo || salvando} onClick={confirmarTroca}>
                <span className="ic"><CheckIcon /></span>{salvando ? "Aplicando..." : "Aplicar troca"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
