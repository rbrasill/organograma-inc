"use client";

// Modal do LÍDER DA ÁREA (card âncora no topo do organograma — pessoa de
// outra área que lidera esta). Não edita os dados dele aqui (ele pertence a
// outra área); a ação deste modal é trocar o líder da ÁREA INTEIRA: todos
// que respondem a ele nesta área passam a responder ao novo escolhido.

import { useEffect, useRef, useState } from "react";
import { UserIcon, CloseIcon, AlertIcon, SearchIcon, ChevronIcon, CheckIcon } from "@/components/icons";

export default function LiderAreaModal({ lider, areaId, areaNome, qtdDiretos, onClose, onTrocado }) {
  const [pickerAberto, setPickerAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [novo, setNovo] = useState(null); // {matricula, nome, cargo, setor}
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const pickerRef = useRef(null);
  const buscaRef = useRef(null);

  // busca em todas as áreas, com debounce
  useEffect(() => {
    if (!pickerAberto) return;
    let ativo = true;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/colaboradores?q=${encodeURIComponent(busca)}&excluir=${encodeURIComponent(lider.id)}`);
        const j = await r.json();
        if (ativo) setResultados(j.ok ? j.resultados : []);
      } catch { if (ativo) setResultados([]); }
      if (ativo) setBuscando(false);
    }, 250);
    return () => { ativo = false; clearTimeout(t); };
  }, [busca, pickerAberto, lider.id]);

  useEffect(() => {
    if (!pickerAberto) return;
    function fora(e) { if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerAberto(false); }
    function esc(e) { if (e.key === "Escape") setPickerAberto(false); }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [pickerAberto]);

  useEffect(() => {
    if (pickerAberto && buscaRef.current) buscaRef.current.focus();
  }, [pickerAberto]);

  async function confirmar() {
    if (!novo) return;
    setSalvando(true);
    setErro("");
    try {
      const r = await fetch("/api/areas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "trocar_lider", areaId,
          deMatricula: lider.id, paraMatricula: novo.matricula,
        }),
      });
      const txt = await r.text();
      let j; try { j = JSON.parse(txt); } catch { j = { ok: false, erro: `Servidor respondeu ${r.status}.` }; }
      if (!j.ok) { setErro(j.erro || "Falha ao trocar o líder."); setSalvando(false); return; }
      onTrocado();
    } catch (e) {
      setErro(`Falha ao trocar: ${e.message}`);
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label="Fechar"><CloseIcon size={16} /></button>

        <div className="modal-head">
          <div className="ava lg"><UserIcon size={30} /></div>
          <div>
            <h3>{lider.nome}</h3>
            <p>{lider.cargo || "Cargo a definir"} · Líder da área {areaNome}</p>
          </div>
        </div>

        <div className="modal-body">
          <div className="modal-note">
            Pertence à área <b>{lider.setorOrigem || "—"}</b> e lidera <b>{qtdDiretos}</b> pessoa(s) de <b>{areaNome}</b>.
            Os dados dele são editados na área de origem — aqui você troca quem lidera esta área.
          </div>

          <div className="modal-section" ref={pickerRef}>
            <span className="sec-title">Líder da área <em>(trocar aqui muda a área inteira)</em></span>

            <div className={`lider-atual ${novo ? "trocado" : ""}`}>
              <span className="la-ava"><UserIcon size={20} /></span>
              <span className="la-txt">
                <b>{novo ? novo.nome : lider.nome}</b>
                <em>{novo ? `${novo.cargo || "Cargo a definir"}${novo.setor ? ` · ${novo.setor}` : ""}` : `${lider.cargo || "Cargo a definir"} · ${lider.setorOrigem || "—"}`}</em>
              </span>
              {novo ? (
                <button className="la-btn undo" onClick={() => { setNovo(null); setPickerAberto(false); }}>Desfazer</button>
              ) : (
                <button className="la-btn" onClick={() => { setBusca(""); setResultados([]); setPickerAberto(true); }}>
                  Trocar <ChevronIcon size={12} />
                </button>
              )}
            </div>

            {pickerAberto && (
              <div className="lider-pop">
                <div className="lider-pick">
                  <span className="lp-ic"><SearchIcon size={14} /></span>
                  <input
                    ref={buscaRef}
                    placeholder="Buscar o novo líder (todas as áreas)..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
                <div className="lp-hint">Pode ser alguém desta área ou de outra.</div>
                <div className="lider-list">
                  {resultados.map((l) => (
                    <button key={l.matricula} className="ll-item" onClick={() => { setNovo(l); setPickerAberto(false); setBusca(""); }}>
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
          </div>

          {erro && <div className="modal-alert"><AlertIcon size={16} /><div><b>{erro}</b></div></div>}

          {novo && (
            <div className="sol-confirma">
              <b className="sol-titulo">Confirmar troca do líder da área</b>
              <ul className="sol-diffs">
                <li>
                  <span className="sol-campo">Líder</span>
                  <span className="sol-de">{lider.nome}</span>
                  <span className="sol-seta">→</span>
                  <span className="sol-para">{novo.nome}</span>
                </li>
              </ul>
              <p className="sol-texto" style={{ marginTop: 8 }}>
                As <b>{qtdDiretos}</b> pessoa(s) de <b>{areaNome}</b> que respondem a {lider.nome} passarão
                a responder a <b>{novo.nome}</b>. A mudança é aplicada na hora.
              </p>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-neutral" onClick={onClose}>Cancelar</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" disabled={!novo || salvando} onClick={confirmar}>
            <span className="ic"><CheckIcon /></span>{salvando ? "Aplicando..." : "Aplicar troca"}
          </button>
        </div>
      </div>
    </div>
  );
}
