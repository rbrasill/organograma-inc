"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { nivelDe, NIVEIS, inconsistenciasDe, CARGOS, AREAS, LOCAIS, opcoesLider, normalizar } from "@/data/ti";
import { UserIcon, CloseIcon, AlertIcon, SearchIcon, ChevronIcon } from "@/components/icons";

// Edição direta (líder, aplica na hora): nome, e-mail, local.
// Estruturais (exigem "Solicitar ajuste"): cargo, área, líder.
// Situação: somente leitura — gerenciada pelo RH/DP, não editável aqui.
// listas: dropdowns vindos do banco (via API); mock só como fallback.
export default function PersonModal({ pessoa, pessoas, byId, listas, areaAtual, onClose, onSalvar }) {
  const CARGOS_OPCOES = listas?.cargos?.length ? listas.cargos : CARGOS;
  const AREAS_OPCOES = listas?.areas?.length ? listas.areas : AREAS;
  const LOCAIS_OPCOES = listas?.locais?.length ? listas.locais : LOCAIS;

  const [nome, setNome] = useState(pessoa.nome);
  const [local, setLocal] = useState(pessoa.local || "");
  const [email, setEmail] = useState(pessoa.email || "");

  // campos estruturais (editáveis só via solicitação — aqui pré-preenchem a solicitação)
  const [cargo, setCargo] = useState(pessoa.cargo || "");
  const [area, setArea] = useState(areaAtual || AREAS_OPCOES[0] || "");
  const [liderId, setLiderId] = useState(pessoa.lider || "");
  const [liderBusca, setLiderBusca] = useState("");
  const [pickerAberto, setPickerAberto] = useState(false);
  const [aviso, setAviso] = useState("");
  const pickerRef = useRef(null);
  const buscaRef = useRef(null);

  const nivel = nivelDe(cargo);
  const cor = NIVEIS[nivel - 1].cor;
  const alertas = inconsistenciasDe(pessoa, byId);

  const liderOriginalId = pessoa.lider || "";
  const mudouLider = liderId !== liderOriginalId;
  const liderSel = liderId ? byId[liderId] : null;
  const liderOriginal = liderOriginalId ? byId[liderOriginalId] : null;

  const lideres = useMemo(() => {
    const q = normalizar(liderBusca);
    const base = opcoesLider(pessoas, pessoa.id);
    if (!q) return base.slice(0, 8);
    return base.filter((l) => normalizar(l.nome).includes(q) || normalizar(l.cargo).includes(q)).slice(0, 8);
  }, [liderBusca, pessoas, pessoa.id]);

  // fecha a lista suspensa ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!pickerAberto) return;
    function fora(e) { if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerAberto(false); }
    function esc(e) { if (e.key === "Escape") setPickerAberto(false); }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [pickerAberto]);

  // foca a busca e garante que o painel fique visível dentro do modal rolável
  useEffect(() => {
    if (pickerAberto && buscaRef.current) {
      buscaRef.current.focus();
      buscaRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [pickerAberto]);

  function abrirPicker() {
    setLiderBusca("");
    setPickerAberto(true);
  }
  function escolherLider(id) {
    setLiderId(id);
    setPickerAberto(false);
    setLiderBusca("");
  }
  function desfazerTroca() {
    setLiderId(liderOriginalId);
    setPickerAberto(false);
    setLiderBusca("");
  }

  function salvar() {
    onSalvar({ ...pessoa, nome, local, email });
    onClose();
  }
  function solicitarAjuste() {
    setAviso("Solicitação de ajuste enviada ao RH/DHO para aprovação. (protótipo)");
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label="Fechar"><CloseIcon size={16} /></button>

        <div className="modal-head">
          <div className="ava lg" style={{ "--lvl": cor }}><UserIcon size={30} /></div>
          <div>
            <h3>{nome}</h3>
            <p>{cargo || "Cargo a definir"} · {NIVEIS[nivel - 1].label}</p>
          </div>
        </div>

        <div className="modal-body">
        {alertas.length > 0 && (
          <div className="modal-alert">
            <AlertIcon size={16} />
            <div>
              <b>Inconsistências detectadas</b>
              <ul>{alertas.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          </div>
        )}

        {/* situação: somente leitura, gerenciada pelo RH/DP */}
        <div className="ro-grid" style={{ marginBottom: 12 }}>
          <div className="ro">
            <span>Situação</span>
            <b className={`sit ${normalizar(pessoa.situacao || "")}`}>{pessoa.situacao || "—"}</b>
          </div>
          <div className="ro">
            <span>Matrícula</span>
            <b>{pessoa.id}</b>
          </div>
        </div>

        <div className="modal-section">
          <span className="sec-title">Edição direta <em>(aplica na hora)</em></span>
          <label className="fld">
            <span>Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="fld">
            <span>Local de trabalho</span>
            <select value={local} onChange={(e) => setLocal(e.target.value)}>
              <option value="">— selecione —</option>
              {LOCAIS_OPCOES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="fld">
            <span>E-mail corporativo</span>
            <input value={email} placeholder="nome@meuinc.com.br" onChange={(e) => setEmail(e.target.value)} />
          </label>
        </div>

        <div className="modal-section">
          <span className="sec-title">Dados estruturais <em>(exigem solicitação de ajuste)</em></span>
          <label className="fld">
            <span>Cargo</span>
            <select value={cargo} onChange={(e) => setCargo(e.target.value)}>
              <option value="">— selecione —</option>
              {CARGOS_OPCOES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="fld">
            <span>Área / Setor</span>
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              {AREAS_OPCOES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>

          {/* líder direto: card em destaque + troca via lista suspensa com busca */}
          <div className="fld fld-lider" ref={pickerRef}>
            <span>Líder direto</span>

            <div className={`lider-atual ${mudouLider ? "trocado" : ""}`}>
              <span className="la-ava"><UserIcon size={20} /></span>
              <span className="la-txt">
                <b>{liderSel ? liderSel.nome : "Sem líder (topo da área)"}</b>
                <em>{liderSel ? (liderSel.cargo || "Cargo a definir") : "Não responde a ninguém nesta área"}</em>
              </span>
              {mudouLider ? (
                <button className="la-btn undo" onClick={desfazerTroca} title="Voltar ao líder atual">Desfazer</button>
              ) : (
                <button className="la-btn" onClick={abrirPicker}>
                  Trocar <ChevronIcon size={12} />
                </button>
              )}
            </div>

            {mudouLider && (
              <div className="lider-troca-nota">
                Novo líder selecionado — líder atual: <b>{liderOriginal ? liderOriginal.nome : "Sem líder (topo)"}</b>.
                A troca só é aplicada após aprovação do RH.
              </div>
            )}

            {pickerAberto && (
              <div className="lider-pop">
                <div className="lider-pick">
                  <span className="lp-ic"><SearchIcon size={14} /></span>
                  <input
                    ref={buscaRef}
                    placeholder="Buscar pelo nome do líder..."
                    value={liderBusca}
                    onChange={(e) => setLiderBusca(e.target.value)}
                  />
                </div>
                {/* a busca não filtra por área: o novo líder pode ser de qualquer
                    setor (troca de área ou de líder na mesma área) */}
                <div className="lp-hint">Busca em todas as áreas — o novo líder pode ser de outro setor.</div>
                <div className="lider-list">
                  <button className={`ll-item ${liderId === "" ? "sel" : ""}`} onClick={() => escolherLider("")}>
                    <b>— Sem líder (topo da área)</b>
                  </button>
                  {lideres.map((l) => (
                    <button key={l.id} className={`ll-item ${liderId === l.id ? "sel" : ""}`} onClick={() => escolherLider(l.id)}>
                      <b>{l.nome}</b><em>{l.cargo || "Cargo a definir"}</em>
                    </button>
                  ))}
                  {lideres.length === 0 && (
                    <div className="ll-vazio">Nenhuma pessoa encontrada para "{liderBusca}"</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {aviso && <div className="modal-note">{aviso}</div>}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={solicitarAjuste}>Solicitar ajuste</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-neutral" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar}>Salvar</button>
        </div>
      </div>
    </div>
  );
}
