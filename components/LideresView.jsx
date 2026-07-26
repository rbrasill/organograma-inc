"use client";

// Diretorias — cada diretoria (ou a presidência) com as áreas sob sua gestão
// e o líder de cada área. Clicar no nome do líder abre um modal só com as
// informações da área (hierarquia + contagem). "Alterar" abre um modal com
// duas opções — Líder direto ou Diretoria — e cada uma leva ao seletor
// correspondente. A troca aplica na área INTEIRA.

import { useCallback, useEffect, useRef, useState } from "react";
import HeroNav from "@/components/HeroNav";
import useSessao from "@/components/useSessao";
import { NIVEL } from "@/lib/perfis";
import {
  UserIcon, CheckIcon, CloseIcon, AlertIcon, SearchIcon,
} from "@/components/icons";

// tom leve e discreto por área/diretor (escolhido pelo nome, estável)
const TONS = 8;
function tomDe(nome) {
  let h = 0;
  for (const ch of nome || "") h = (h + ch.charCodeAt(0)) % 997;
  return `tone-${h % TONS}`;
}

export default function LideresView() {
  const sessao = useSessao(); // COLABORADOR/GESTOR: somente leitura; ADMIN edita
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
  // passo do modal Alterar: null = escolha (líder/diretoria); depois o seletor
  const [aba, setAba] = useState(null); // null | "lider" | "diretor"
  const [novoDir, setNovoDir] = useState(null);
  const buscaRef = useRef(null);

  // modal de informações da área (aberto ao clicar no nome do líder direto)
  const [info, setInfo] = useState(null); // { areaNome, diretorNome, liderNome, pessoas }

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

  // busca do novo líder (todas as áreas), com debounce — só no passo do líder
  useEffect(() => {
    if (!alvo || aba !== "lider" || novo) return;
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
  }, [busca, alvo, aba, novo]);

  useEffect(() => {
    if (alvo && aba === "lider" && !novo && buscaRef.current) buscaRef.current.focus();
  }, [alvo, aba, novo]);

  // Esc fecha o modal
  useEffect(() => {
    if (!alvo) return;
    function esc(e) { if (e.key === "Escape") fecharTroca(); }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo]);

  function abrirTroca(area, diretorNome, diretorMat) {
    setAlvo({
      areaId: area.id, areaNome: area.nome, pessoas: area.pessoas,
      lider: area.lider, semLiderInterno: !!area.semLiderInterno,
      diretorNome: diretorNome || "", diretorMat: diretorMat || "",
    });
    setBusca(""); setResultados([]); setNovo(null); setNovoDir(null);
    setAba(null); setErroTroca(""); setMsg("");
  }
  function fecharTroca() {
    setAlvo(null); setNovo(null); setNovoDir(null); setBusca(""); setErroTroca("");
  }

  async function confirmarTroca() {
    if (!alvo || (aba === "lider" ? !novo : !novoDir)) return;
    setSalvando(true);
    setErroTroca("");
    try {
      const payload = aba === "lider"
        ? { acao: "trocar", areaId: alvo.areaId, deMatricula: alvo.lider.matricula, paraMatricula: novo.matricula }
        : { acao: "trocar_diretor", areaId: alvo.areaId, paraMatricula: novoDir.matricula };
      const r = await fetch("/api/lideres", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const txt = await r.text();
      let j; try { j = JSON.parse(txt); } catch { j = { ok: false, erro: `Servidor respondeu ${r.status}.` }; }
      if (!j.ok) { setErroTroca(j.erro || "Falha ao aplicar a troca."); setSalvando(false); return; }
      setMsg(aba === "lider"
        ? `Líder de ${alvo.areaNome} alterado para ${novo.nome}. ${j.reapontados} colaborador(es) reapontado(s)${j.antigoReaponta ? ` — ${alvo.lider.nome} agora responde ao novo líder` : ""}.`
        : `Diretor de ${alvo.areaNome} alterado para ${j.diretorNome || novoDir.nome}. O líder direto continua sendo ${alvo.lider.nome}.`);
      fecharTroca();
      await carregar();
    } catch (e) { setErroTroca(`Falha: ${e.message}`); }
    setSalvando(false);
  }

  // ===== modal de informações da área (clique no líder direto) =====
  function abrirInfo(area, diretorNome) {
    setInfo({
      areaNome: area.nome,
      diretorNome: diretorNome || "",
      liderNome: area.lider.nome,
      pessoas: area.pessoas,
    });
  }
  function fecharInfo() { setInfo(null); }

  useEffect(() => {
    if (!info) return;
    function esc(e) { if (e.key === "Escape") fecharInfo(); }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [info]);

  // Card da área: mostra só o líder direto. Clicar no nome abre o modal de
  // informações; "Alterar" abre o modal com as duas opções (líder / diretoria).
  function CardArea({ area, diretorNome, diretorMat }) {
    const admin = sessao.nivel >= NIVEL.ADMIN;
    return (
      <div className="ld-card">
        <div className="ld-area">
          <b>{area.nome}</b>
          <span className="ar-count">{area.pessoas} colab.</span>
        </div>

        <div className="lider-atual">
          <span className="la-ava"><UserIcon size={20} /></span>
          <span className="la-txt">
            <span className="ld-papel-rot">Líder direto</span>
            <button className="la-nome-btn" onClick={() => abrirInfo(area, diretorNome)} title="Ver informações da área">
              {area.lider.nome}
            </button>
            <span className="la-meta">
              {area.semLiderInterno
                ? <span className="ld-tag-sem">sem líder interno · quem responde é o diretor</span>
                : (area.lider.tag && <span className="ld-tag-dir">{area.lider.tag}</span>)}
            </span>
            <em>{area.lider.cargo || "Cargo a definir"}</em>
          </span>
          {admin && (
            <button className="la-btn" onClick={() => abrirTroca(area, diretorNome, diretorMat)}>
              Alterar
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="sol-shell">
      <HeroNav
        titulo="Diretorias"
        subtitulo="Cada diretoria com as áreas sob sua gestão e o líder de cada uma"
        atual="lideres"
      />

      <div className="ct-board">
        {erro && <div className="modal-alert"><AlertIcon size={16} /><div><b>{erro}</b></div></div>}
        {msg && <div className="modal-note sol-ok"><b>{msg}</b></div>}
        {carregando && <div className="ar-vazio">Carregando diretorias...</div>}

        {!carregando && dados && dados.diretores.map((g) => (
          <section className="ld-grupo" key={g.diretor.matricula || g.diretor.nome}>
            <div className={`ld-dir ${tomDe(g.diretor.nome)}`}>
              <span className="ld-dir-ava"><UserIcon size={22} /></span>
              <span className="ld-dir-txt">
                <b>{g.diretor.nome}</b>
                <em>
                  {g.diretor.cargo || "Cargo a definir"}
                  {g.diretor.setor ? ` · ${g.diretor.setor}` : ""}
                  {g.diretor.respondeA ? ` · responde a ${g.diretor.respondeA}` : ""}
                </em>
              </span>
              <span className="ld-dir-chip">{g.areas.length} área(s) na diretoria</span>
            </div>
            <div className="ld-grid">
              {g.areas.map((a) => <CardArea key={a.id} area={a} diretorNome={g.diretor.nome} diretorMat={g.diretor.matricula} />)}
            </div>
          </section>
        ))}

        {!carregando && dados && dados.semDiretor.length > 0 && (
          <section className="ld-grupo">
            <div className="ld-dir topo">
              <span className="ld-dir-ava"><UserIcon size={22} /></span>
              <span className="ld-dir-txt">
                <b>Sem diretoria</b>
                <em>O líder destas áreas não chega a nenhum diretor nem à presidência — altere o líder para conectá-las a uma diretoria</em>
              </span>
              <span className="ld-dir-chip">{dados.semDiretor.length} área(s)</span>
            </div>
            <div className="ld-grid">
              {dados.semDiretor.map((a) => <CardArea key={a.id} area={a} diretorNome="" diretorMat="" />)}
            </div>
          </section>
        )}
      </div>

      {/* ===== modal Alterar: passo 1 = escolha; passo 2 = seletor ===== */}
      {alvo && (
        <div className="modal-overlay" onMouseDown={fecharTroca}>
          <div className="modal ld-alt-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-x" onClick={fecharTroca} aria-label="Fechar"><CloseIcon size={16} /></button>

            <div className="modal-head">
              <div>
                <h3>
                  {aba === "lider" ? "Alterar líder direto"
                    : aba === "diretor" ? "Alterar diretoria"
                    : "Alterar"} — {alvo.areaNome}
                </h3>
                {aba === null && <p>O que você quer alterar?</p>}
              </div>
            </div>

            <div className="modal-body">
              {/* passo 1: as duas opções, e nada mais */}
              {aba === null && (
                <div className="md-opts">
                  <button className="md-opt" onClick={() => { setAba("diretor"); setNovo(null); setErroTroca(""); }}>
                    <span className="md-opt-ic"><UserIcon size={20} /></span>
                    <span className="md-opt-tx"><b>Diretoria</b></span>
                  </button>
                  <button className="md-opt" onClick={() => { setAba("lider"); setNovoDir(null); setErroTroca(""); }}>
                    <span className="md-opt-ic"><UserIcon size={20} /></span>
                    <span className="md-opt-tx"><b>Líder direto</b></span>
                  </button>
                </div>
              )}

              {/* passo 2a: seletor de líder direto (busca) */}
              {aba === "lider" && (
                <>
                  <div className="lider-pick">
                    <span className="lp-ic"><SearchIcon size={14} /></span>
                    <input
                      ref={buscaRef}
                      placeholder="Buscar pelo nome..."
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                    />
                  </div>
                  <div className="lider-list ld-modal-lista">
                    {resultados.map((l) => (
                      <button
                        key={l.matricula}
                        className={`ll-item ${novo?.matricula === l.matricula ? "sel" : ""}`}
                        onClick={() => setNovo(novo?.matricula === l.matricula ? null : l)}
                      >
                        <b>{l.nome}</b><em>{(l.cargo || "Cargo a definir")}{l.setor ? ` · ${l.setor}` : ""}</em>
                      </button>
                    ))}
                    {buscando && <div className="ll-vazio">Buscando...</div>}
                    {!buscando && resultados.length === 0 && (
                      <div className="ll-vazio">{busca ? "Nada encontrado" : "Digite para buscar"}</div>
                    )}
                  </div>
                </>
              )}

              {/* passo 2b: seletor de diretoria (lista de responsáveis) */}
              {aba === "diretor" && (
                alvo.semLiderInterno ? (
                  <div className="ld-erro-box">Defina o líder direto antes de trocar a diretoria.</div>
                ) : (
                  <div className="lider-list ld-modal-lista">
                    {(dados?.responsaveis || [])
                      .filter((d) => d.matricula !== alvo.diretorMat && d.matricula !== alvo.lider.matricula)
                      .map((d) => (
                        <button
                          key={d.matricula}
                          className={`ll-item ${novoDir?.matricula === d.matricula ? "sel" : ""}`}
                          onClick={() => setNovoDir(novoDir?.matricula === d.matricula ? null : d)}
                        >
                          <b>{d.nome}</b><em>{d.familia || d.cargo || "—"}{d.setor ? ` · ${d.setor}` : ""}</em>
                        </button>
                      ))}
                  </div>
                )
              )}

              {erroTroca && <div className="ld-erro-box" style={{ marginTop: 10 }}>{erroTroca}</div>}
            </div>

            {/* rodapé só depois de escolher o que alterar */}
            {aba !== null && (
              <div className="modal-foot">
                <button className="btn btn-neutral" onClick={() => { setAba(null); setNovo(null); setNovoDir(null); setErroTroca(""); }}>
                  Voltar
                </button>
                <div style={{ flex: 1 }} />
                <button
                  className="btn btn-primary"
                  disabled={salvando || (aba === "lider" ? !novo : (!novoDir || alvo.semLiderInterno))}
                  onClick={confirmarTroca}
                >
                  <span className="ic"><CheckIcon /></span>{salvando ? "Aplicando..." : "Aplicar"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== modal de informações da área (clique no líder direto) ===== */}
      {info && (
        <div className="modal-overlay" onMouseDown={fecharInfo}>
          <div className="modal ld-info-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-x" onClick={fecharInfo} aria-label="Fechar"><CloseIcon size={16} /></button>
            <div className="modal-head">
              <div>
                <h3>{info.areaNome}</h3>
                <p>Hierarquia da área</p>
              </div>
            </div>
            <div className="modal-body">
              <div className="ld-escada">
                <div className="ld-degrau">
                  <span className="ld-degrau-rot">Diretoria</span>
                  <b>{info.diretorNome || "— sem diretor"}</b>
                </div>
                <div className="ld-degrau-liga">↑ responde a</div>
                <div className="ld-degrau foco">
                  <span className="ld-degrau-rot">Líder direto</span>
                  <b>{info.liderNome}</b>
                </div>
                <div className="ld-degrau-liga">↑ responde a</div>
                <div className="ld-degrau">
                  <span className="ld-degrau-rot">Colaboradores</span>
                  <b>{info.pessoas} pessoas na diretoria</b>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <div style={{ flex: 1 }} />
              <button className="btn btn-neutral" onClick={fecharInfo}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
