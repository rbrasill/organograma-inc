"use client";

// Líderes por área — visão agrupada por DIRETOR: cada diretor com as áreas
// que gerencia e o líder de cada área. Trocar o líder aplica na área INTEIRA
// (quem respondia ao antigo passa ao novo; o antigo vira subordinado do novo;
// novo líder da própria área herda o diretor).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  UserIcon, CheckIcon, AlertIcon, ChevronIcon, SearchIcon,
} from "@/components/icons";

export default function LideresView() {
  const [dados, setDados] = useState(null); // { diretores, semDiretor }
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  // troca de líder (uma área por vez)
  const [alvo, setAlvo] = useState(null); // { areaId, areaNome, lider }
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

  function abrirTroca(area) {
    setAlvo({ areaId: area.id, areaNome: area.nome, lider: area.lider });
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
      setMsg(`Líder de ${alvo.areaNome} trocado para ${novo.nome}. ${j.reapontados} colaborador(es) reapontado(s)${j.antigoReaponta ? ` — ${alvo.lider.nome} agora responde ao novo líder` : ""}.`);
      fecharTroca();
      await carregar();
    } catch (e) { setErroTroca(`Falha: ${e.message}`); }
    setSalvando(false);
  }

  function CardArea({ area }) {
    const emTroca = alvo?.areaId === area.id;
    return (
      <div className={`ld-card ${emTroca ? "ct-editando" : ""}`}>
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
          {!emTroca && (
            <button className="la-btn" onClick={() => abrirTroca(area)}>
              Trocar <ChevronIcon size={12} />
            </button>
          )}
        </div>
        {area.outrosTopo > 0 && (
          <p className="ld-nota">+ {area.outrosTopo} pessoa(s) também no topo desta área (sem líder interno).</p>
        )}

        {emTroca && !novo && (
          <div className="ld-troca">
            <div className="lider-pick">
              <span className="lp-ic"><SearchIcon size={14} /></span>
              <input
                ref={buscaRef}
                placeholder="Buscar o novo líder (todas as áreas)..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <div className="lider-list">
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
            <div className="cp-acoes">
              <button className="btn btn-neutral btn-sm" onClick={fecharTroca}>Cancelar</button>
            </div>
          </div>
        )}

        {emTroca && novo && (
          <div className="sol-confirma">
            <b className="sol-titulo">Confirmar troca do líder de {area.nome}</b>
            <ul className="sol-diffs">
              <li>
                <span className="sol-campo">Líder</span>
                <span className="sol-de">{area.lider.nome}</span>
                <span className="sol-seta">→</span>
                <span className="sol-para">{novo.nome}</span>
              </li>
            </ul>
            <p className="sol-texto" style={{ marginTop: 8 }}>
              A troca vale para a área inteira: <b>{area.lider.diretos}</b> colaborador(es) que respondem
              a {area.lider.nome} passam a responder a <b>{novo.nome}</b>, e {area.lider.nome} passa a
              responder ao novo líder.{" "}
              {novo.setor ? (novo.setor === area.nome
                ? "Como o novo líder é da própria área, ele herda o diretor atual."
                : `O novo líder é de ${novo.setor} — entra como líder externo (padrão diretor).`) : ""}
            </p>
            {erroTroca && <div className="ct-erro"><AlertIcon size={13} /> {erroTroca}</div>}
            <div className="cp-acoes">
              <button className="btn btn-neutral btn-sm" onClick={() => setNovo(null)}>Voltar</button>
              <button className="btn btn-primary btn-sm" disabled={salvando} onClick={confirmarTroca}>
                <span className="ic"><CheckIcon /></span>{salvando ? "Aplicando..." : "Aplicar troca"}
              </button>
            </div>
          </div>
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
            <p>Diretores, áreas sob sua gestão e o líder de cada área · trocar aplica na área inteira</p>
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
            <div className="ld-dir">
              <span className="ld-dir-ava"><UserIcon size={22} /></span>
              <span className="ld-dir-txt">
                <b>{g.diretor.nome}</b>
                <em>{g.diretor.cargo || "Cargo a definir"}{g.diretor.setor ? ` · ${g.diretor.setor}` : ""}</em>
              </span>
              <span className="ld-dir-chip">{g.areas.length} área(s) sob gestão</span>
            </div>
            <div className="ld-grid">
              {g.areas.map((a) => <CardArea key={a.id} area={a} />)}
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
              {dados.semDiretor.map((a) => <CardArea key={a.id} area={a} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
