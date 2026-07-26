"use client";

// Diretorias — cada diretoria (ou a presidência) com as áreas sob sua gestão
// e o líder de cada área. "Alterar" abre um modal que cobre os dois casos num
// fluxo só: escolher alguém da própria área troca apenas o líder (a área
// permanece na diretoria); escolher um diretor ou alguém de outra diretoria
// move a área inteira para a cadeia dele. A troca aplica na área INTEIRA.

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
  // aba do modal: trocar o líder da área ou só a diretoria dela
  const [aba, setAba] = useState("lider"); // "lider" | "diretor"
  const [novoDir, setNovoDir] = useState(null);
  const buscaRef = useRef(null);

  // modal de perfil do líder (visão completa dele no organograma)
  const [perfilMat, setPerfilMat] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [perfilCarregando, setPerfilCarregando] = useState(false);
  const [perfilErro, setPerfilErro] = useState("");

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

  function abrirTroca(area, diretorNome, diretorMat) {
    setAlvo({
      areaId: area.id, areaNome: area.nome, pessoas: area.pessoas,
      lider: area.lider, diretorNome: diretorNome || "", diretorMat: diretorMat || "",
    });
    setBusca(""); setResultados([]); setNovo(null); setNovoDir(null);
    setAba("lider"); setErroTroca(""); setMsg("");
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
        : `${alvo.areaNome} passou para a diretoria de ${j.diretorNome || novoDir.nome} — o líder ${alvo.lider.nome} continua o mesmo.`);
      fecharTroca();
      await carregar();
    } catch (e) { setErroTroca(`Falha: ${e.message}`); }
    setSalvando(false);
  }

  // ===== perfil do líder =====
  const abrirPerfil = useCallback(async (matricula) => {
    if (!matricula) return;
    setPerfilMat(matricula); setPerfil(null); setPerfilErro(""); setPerfilCarregando(true);
    try {
      const r = await fetch(`/api/lideres?perfil=${encodeURIComponent(matricula)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Falha ao carregar o perfil.");
      setPerfil(j.perfil);
    } catch (e) { setPerfilErro(e.message); }
    setPerfilCarregando(false);
  }, []);
  function fecharPerfil() { setPerfilMat(null); setPerfil(null); setPerfilErro(""); }

  useEffect(() => {
    if (!perfilMat) return;
    function esc(e) { if (e.key === "Escape") fecharPerfil(); }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [perfilMat]);

  function CardArea({ area, diretorNome, diretorMat }) {
    return (
      <div className="ld-card">
        <div className="ld-area">
          <b>{area.nome}</b>
          <span className="ar-count">{area.pessoas} colab.</span>
        </div>

        <div className="lider-atual">
          <span className="la-ava"><UserIcon size={20} /></span>
          <span className="la-txt">
            <button className="la-nome-btn" onClick={() => abrirPerfil(area.lider.matricula)} title="Ver perfil completo do líder">
              {area.lider.nome}
            </button>
            {/* linha discreta reservada (sempre presente → todos os cards com
                a mesma altura, com ou sem tag). Detalhe de quantos lidera
                fica só no perfil completo (clique no nome). */}
            <span className="la-meta">
              {area.lider.tag && <span className="ld-tag-dir">{area.lider.tag}</span>}
            </span>
            <em>{area.lider.cargo || "Cargo a definir"}</em>
          </span>
          {sessao.nivel >= NIVEL.ADMIN && (
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

      {/* ===== modal de alterar líder ===== */}
      {alvo && (
        <div className="modal-overlay" onMouseDown={fecharTroca}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-x" onClick={fecharTroca} aria-label="Fechar"><CloseIcon size={16} /></button>

            <div className="modal-head">
              <div className="ld-modal-ava"><UserIcon size={26} /></div>
              <div>
                <h3>Alterar liderança — {alvo.areaNome}</h3>
                <p>Troque o líder da área ou mova a área para outra diretoria</p>
              </div>
            </div>

            <div className="modal-body">
              {/* o que trocar: o líder da área ou a diretoria a que ela responde */}
              <div className="ld-tabs">
                <button
                  type="button"
                  className={`ld-tab ${aba === "lider" ? "sel" : ""}`}
                  onClick={() => { setAba("lider"); setNovoDir(null); setErroTroca(""); }}
                >Líder da área</button>
                <button
                  type="button"
                  className={`ld-tab ${aba === "diretor" ? "sel" : ""}`}
                  onClick={() => { setAba("diretor"); setNovo(null); setErroTroca(""); }}
                >Diretoria</button>
              </div>

              {/* contexto da área e do líder atual */}
              <div className="ro-grid" style={{ marginBottom: 12 }}>
                <div className="ro"><span>Área</span><b>{alvo.areaNome}</b></div>
                <div className="ro"><span>Colaboradores</span><b>{alvo.pessoas}</b></div>
                <div className="ro"><span>Diretoria</span><b>{alvo.diretorNome || "— (sem diretoria)"}</b></div>
                <div className="ro"><span>Respondem ao líder</span><b>{alvo.lider.diretos} direto(s)</b></div>
              </div>

              {aba === "lider" && (
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
              )}

              {aba === "lider" && !novo && (
                <div className="modal-section">
                  <span className="sec-title">Novo líder <em>(busca em todas as áreas)</em></span>
                  <p className="lp-hint" style={{ margin: "0 0 8px" }}>
                    Troca quem lidera a área por dentro — ela permanece nesta diretoria.
                    Para mudar a quem a área responde, use a aba <b>Diretoria</b>.
                  </p>
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

              {aba === "lider" && novo && (
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
                    responder a <b>{novo.nome}</b>
                    {alvo.lider.externo
                      ? (novo.setor === alvo.areaNome
                        ? <>, e <b>{novo.nome}</b> passa a responder ao diretor {alvo.lider.nome}.</>
                        : ".")
                      : <>, e {alvo.lider.nome} passa a responder ao novo líder.</>}{" "}
                    {novo.setor && novo.setor !== alvo.areaNome
                      ? `Atenção: o novo líder é de ${novo.setor} — a área passa a responder pela cadeia dele. Para trocar só a diretoria, cancele e use a aba Diretoria.`
                      : (!alvo.lider.externo && novo.setor === alvo.areaNome
                        ? "Como o novo líder é da própria área, ela permanece na diretoria atual."
                        : "")}
                  </p>
                </div>
              )}

              {aba === "diretor" && (
                <div className="modal-section">
                  <span className="sec-title">Nova diretoria <em>(diretores, presidente e conselheiro)</em></span>
                  <p className="lp-hint" style={{ margin: "0 0 8px" }}>
                    Muda a quem a área responde. O líder <b>{alvo.lider.nome}</b> continua o mesmo —
                    apenas passa a responder ao novo responsável.
                  </p>
                  <div className="lider-list ld-modal-lista">
                    {(dados?.responsaveis || [])
                      .filter((d) => d.matricula !== alvo.diretorMat && d.matricula !== alvo.lider.matricula)
                      .map((d) => (
                        <button
                          key={d.matricula}
                          className={`ll-item ${novoDir?.matricula === d.matricula ? "sel" : ""}`}
                          onClick={() => setNovoDir(d)}
                        >
                          <b>{d.nome}</b>
                          <em>{d.familia || d.cargo || "—"}{d.setor ? ` · ${d.setor}` : ""}</em>
                        </button>
                      ))}
                    {(dados?.responsaveis || []).length === 0 && (
                      <div className="ll-vazio">Nenhum diretor cadastrado nos níveis 1–5.</div>
                    )}
                  </div>
                </div>
              )}

              {aba === "diretor" && novoDir && (
                <div className="sol-confirma">
                  <b className="sol-titulo">Confirmar a troca de diretoria</b>
                  <ul className="sol-diffs">
                    <li>
                      <span className="sol-campo">Diretoria</span>
                      <span className="sol-de">{alvo.diretorNome || "Sem diretoria"}</span>
                      <span className="sol-seta">→</span>
                      <span className="sol-para">{novoDir.nome}</span>
                    </li>
                  </ul>
                  <p className="sol-texto" style={{ marginTop: 8 }}>
                    <b>{alvo.areaNome}</b> passa a responder a <b>{novoDir.nome}</b>.
                    O líder da área ({alvo.lider.nome}) e toda a estrutura interna continuam como estão.
                  </p>
                </div>
              )}

              {erroTroca && <div className="modal-alert"><AlertIcon size={16} /><div><b>{erroTroca}</b></div></div>}
            </div>

            <div className="modal-foot">
              <button className="btn btn-neutral" onClick={fecharTroca}>Cancelar</button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-primary" disabled={salvando || (aba === "lider" ? !novo : !novoDir)} onClick={confirmarTroca}>
                <span className="ic"><CheckIcon /></span>{salvando ? "Aplicando..." : "Aplicar troca"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== modal de perfil do líder (visão completa no organograma) ===== */}
      {perfilMat && (
        <div className="modal-overlay" onMouseDown={fecharPerfil}>
          <div className="modal lp-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-x" onClick={fecharPerfil} aria-label="Fechar"><CloseIcon size={16} /></button>

            {perfilCarregando && <div className="modal-body"><div className="ar-vazio">Carregando perfil...</div></div>}
            {!perfilCarregando && perfilErro && (
              <div className="modal-body"><div className="modal-alert"><AlertIcon size={16} /><div><b>{perfilErro}</b></div></div></div>
            )}

            {!perfilCarregando && perfil && (
              <>
                <div className="modal-head">
                  <div className="lp-ava" style={{ "--tone-line": perfil.cor || "var(--line)", "--tone-text": perfil.cor || "var(--ink-soft)" }}>
                    <UserIcon size={28} />
                  </div>
                  <div>
                    <h3>{perfil.nome}</h3>
                    <p>
                      {perfil.cargo || "Cargo a definir"}
                      {perfil.familia ? ` · ${perfil.familia}${perfil.cod_var ? ` (${perfil.cod_var})` : ""}` : ""}
                      {perfil.pj ? " · PJ" : ""}
                    </p>
                  </div>
                </div>

                <div className="modal-body">
                  <div className="ro-grid" style={{ marginBottom: 14 }}>
                    <div className="ro"><span>Matrícula</span><b>{perfil.matricula || "—"}</b></div>
                    <div className="ro"><span>Área</span><b>{perfil.setor || "—"}</b></div>
                    <div className="ro"><span>Situação</span><b>{perfil.situacao || "—"}</b></div>
                    <div className="ro"><span>Lidera diretamente</span><b>{perfil.totalDiretos} pessoa(s)</b></div>
                  </div>

                  {/* cadeia de comando: da pessoa até o topo */}
                  {perfil.cadeia?.length > 0 && (
                    <div className="modal-section">
                      <span className="sec-title">Responde a</span>
                      <div className="lp-cadeia">
                        {perfil.cadeia.map((p, i) => (
                          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                            {i > 0 && <span className="lp-seta">↑</span>}
                            <span className="lp-chip">{p.nome}<em>{p.cargo || p.familia || ""}</em></span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* áreas onde é o líder direto */}
                  {perfil.lideraAreas?.length > 0 && (
                    <div className="modal-section">
                      <span className="sec-title">Líder da(s) área(s)</span>
                      <div className="lp-tags">
                        {perfil.lideraAreas.map((a) => (
                          <span key={a.nome} className="lp-area-tag">{a.nome} <em>{a.pessoas}</em></span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* áreas sob gestão (como diretor responsável) */}
                  {perfil.areasGeridas?.length > 0 && (
                    <div className="modal-section">
                      <span className="sec-title">Áreas sob sua gestão ({perfil.areasGeridas.length})</span>
                      <div className="lp-geridas">
                        {perfil.areasGeridas.map((a) => (
                          <div key={a.nome} className="lp-gerida">
                            <b>{a.nome}</b>
                            <em>líder: {a.liderNome}</em>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* equipe direta */}
                  {perfil.diretos?.length > 0 && (
                    <div className="modal-section">
                      <span className="sec-title">Equipe direta ({perfil.totalDiretos})</span>
                      <div className="lp-equipe">
                        {perfil.diretos.map((p) => (
                          <div key={p.matricula || p.nome} className="lp-membro">
                            <span className="lp-membro-ava"><UserIcon size={15} /></span>
                            <span className="lp-membro-txt">
                              <b>{p.nome}</b>
                              <em>{p.cargo || "Cargo a definir"}{p.setor ? ` · ${p.setor}` : ""}</em>
                            </span>
                          </div>
                        ))}
                      </div>
                      {perfil.totalDiretos > perfil.diretos.length && (
                        <p className="lp-mais">+ {perfil.totalDiretos - perfil.diretos.length} outro(s)</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="modal-foot">
                  <div style={{ flex: 1 }} />
                  <button className="btn btn-neutral" onClick={fecharPerfil}>Fechar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
