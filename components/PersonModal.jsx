"use client";

import { useMemo, useState } from "react";
import { nivelDe, NIVEIS, inconsistenciasDe, CARGOS, AREAS, LOCAIS, SITUACOES, opcoesLider, normalizar } from "@/data/ti";
import { UserIcon, CloseIcon, AlertIcon, SearchIcon } from "@/components/icons";

// Edição direta (líder, aplica na hora): nome, e-mail, local.
// Estruturais (exigem "Solicitar ajuste"): cargo, área, líder, situação.
export default function PersonModal({ pessoa, pessoas, byId, onClose, onSalvar }) {
  const [nome, setNome] = useState(pessoa.nome);
  const [local, setLocal] = useState(pessoa.local || "");
  const [email, setEmail] = useState(pessoa.email || "");

  // campos estruturais (editáveis só via solicitação — aqui pré-preenchem a solicitação)
  const [cargo, setCargo] = useState(pessoa.cargo || "");
  const [area, setArea] = useState("Tecnologia da Informação");
  const [situacao, setSituacao] = useState(pessoa.situacao || "");
  const [liderId, setLiderId] = useState(pessoa.lider || "");
  const [liderBusca, setLiderBusca] = useState("");
  const [aviso, setAviso] = useState("");

  const nivel = nivelDe(cargo);
  const cor = NIVEIS[nivel - 1].cor;
  const alertas = inconsistenciasDe(pessoa, byId);

  const lideres = useMemo(() => {
    const q = normalizar(liderBusca);
    const base = opcoesLider(pessoas, pessoa.id);
    if (!q) return base.slice(0, 8);
    return base.filter((l) => normalizar(l.nome).includes(q) || normalizar(l.cargo).includes(q)).slice(0, 8);
  }, [liderBusca, pessoas, pessoa.id]);

  const liderNome = liderId && byId[liderId] ? byId[liderId].nome : "— (topo)";

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

        {alertas.length > 0 && (
          <div className="modal-alert">
            <AlertIcon size={16} />
            <div>
              <b>Inconsistências detectadas</b>
              <ul>{alertas.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          </div>
        )}

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
              {LOCAIS.map((l) => <option key={l} value={l}>{l}</option>)}
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
              {CARGOS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="fld">
            <span>Área / Setor</span>
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="fld">
            <span>Situação</span>
            <select value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="">— selecione —</option>
              {SITUACOES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <div className="fld">
            <span>Líder direto <em style={{color:"var(--ink-faint)",fontStyle:"normal",fontWeight:500}}>(atual: {liderNome})</em></span>
            <div className="lider-pick">
              <span className="lp-ic"><SearchIcon size={14} /></span>
              <input placeholder="Buscar líder..." value={liderBusca} onChange={(e) => setLiderBusca(e.target.value)} />
            </div>
            <div className="lider-list">
              <button className={`ll-item ${liderId === "" ? "sel" : ""}`} onClick={() => setLiderId("")}>
                — Sem líder (topo da área)
              </button>
              {lideres.map((l) => (
                <button key={l.id} className={`ll-item ${liderId === l.id ? "sel" : ""}`} onClick={() => setLiderId(l.id)}>
                  <b>{l.nome}</b><em>{l.cargo || "Cargo a definir"}</em>
                </button>
              ))}
            </div>
          </div>
        </div>

        {aviso && <div className="modal-note">{aviso}</div>}

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
