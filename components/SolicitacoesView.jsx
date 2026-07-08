"use client";

// Página do RH para revisar solicitações de ajuste (lista + detalhe).
// Layout mestre-detalhe: lista à esquerda (filtro por status), detalhe à
// direita com o de→para, observação e ações Aprovar / Devolver.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  UserIcon, CheckIcon, CloseIcon, AlertIcon, ChevronIcon, SearchIcon,
} from "@/components/icons";

const TIPO_LABEL = {
  inclusao: "Inclusão", desligamento: "Desligamento", mudanca_cargo: "Mudança de cargo",
  mudanca_area: "Mudança de área", correcao_vinculo: "Correção de vínculo", nova_area: "Nova área",
};
const CAMPO_LABEL = { cargo: "Cargo", area: "Área", setor: "Área", situacao: "Situação", lider: "Líder" };
const STATUS_FILTROS = [
  { key: "pendente", label: "Pendentes" },
  { key: "aprovada", label: "Aprovadas" },
  { key: "devolvida", label: "Devolvidas" },
  { key: "todas", label: "Todas" },
];

function quando(dt) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return String(dt); }
}

export default function SolicitacoesView() {
  const [filtro, setFiltro] = useState("pendente");
  const [lista, setLista] = useState([]);
  const [pendentes, setPendentes] = useState(0);
  const [selId, setSelId] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");

  const [obsDevolver, setObsDevolver] = useState("");
  const [devolvendo, setDevolvendo] = useState(false);
  const [agindo, setAgindo] = useState(false);

  const carregar = useCallback(async (mostrarLoading = true) => {
    if (mostrarLoading) setCarregando(true);
    setErro("");
    try {
      const r = await fetch(`/api/solicitacoes?status=${filtro}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Falha ao carregar.");
      setLista(j.solicitacoes);
      setPendentes(j.pendentes);
      setSelId((atual) => (j.solicitacoes.some((s) => s.id === atual) ? atual : j.solicitacoes[0]?.id || null));
    } catch (e) { setErro(e.message); setLista([]); }
    setCarregando(false);
  }, [filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  const listaFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((s) => (s.alvo.nome || "").toLowerCase().includes(q) || (s.alvo.matricula || "").includes(q));
  }, [lista, busca]);

  const sel = lista.find((s) => s.id === selId) || null;

  async function agir(payload) {
    setAgindo(true); setErro("");
    try {
      const r = await fetch("/api/solicitacoes", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const txt = await r.text();
      let j; try { j = JSON.parse(txt); } catch { j = { ok: false, erro: `Servidor respondeu ${r.status}.` }; }
      if (!j.ok) { setErro(j.erro || "Falha na ação."); setAgindo(false); return; }
      setDevolvendo(false); setObsDevolver("");
      await carregar(false);
    } catch (e) { setErro(`Falha: ${e.message}`); }
    setAgindo(false);
  }

  return (
    <div className="sol-shell">
      <div className="sol-topbar">
        <div className="brand">
          <div className="logo">INC</div>
          <div>
            <h1>Solicitações de ajuste</h1>
            <p>RH / DHO · aprovar ou devolver mudanças estruturais</p>
          </div>
        </div>
        <Link href="/" className="btn btn-neutral"><ChevronIcon size={13} /> Voltar ao organograma</Link>
      </div>

      <div className="sol-board">
        {/* LISTA */}
        <aside className="sol-lista-wrap">
          <div className="sol-filtros">
            {STATUS_FILTROS.map((f) => (
              <button key={f.key} className={`sol-tab ${filtro === f.key ? "on" : ""}`} onClick={() => setFiltro(f.key)}>
                {f.label}{f.key === "pendente" && pendentes > 0 ? ` (${pendentes})` : ""}
              </button>
            ))}
          </div>
          <div className="sol-busca">
            <SearchIcon size={14} />
            <input placeholder="Buscar por nome ou matrícula..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>

          <div className="sol-lista">
            {carregando && <div className="sol-info">Carregando...</div>}
            {!carregando && erro && <div className="sol-info erro"><AlertIcon size={18} /><span>{erro}</span></div>}
            {!carregando && !erro && listaFiltrada.length === 0 && (
              <div className="sol-info">Nenhuma solicitação {filtro !== "todas" ? STATUS_FILTROS.find((f) => f.key === filtro)?.label.toLowerCase() : ""}.</div>
            )}
            {listaFiltrada.map((s) => (
              <button key={s.id} className={`sol-card ${selId === s.id ? "sel" : ""}`} onClick={() => { setSelId(s.id); setDevolvendo(false); }}>
                <span className="sc-ava"><UserIcon size={18} /></span>
                <span className="sc-txt">
                  <b>{s.alvo.nome || "—"}</b>
                  <em>{TIPO_LABEL[s.tipo] || s.tipo} · {s.payload?.mudancas?.length || 0} alteração(ões)</em>
                  <small>{quando(s.criadoEm)}</small>
                </span>
                <span className={`sc-status st-${s.status}`}>
                  {s.status === "pendente" ? "Pendente" : s.status === "aprovada" ? "Aprovada" : "Devolvida"}
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* DETALHE */}
        <section className="sol-detalhe">
          {!sel && <div className="sol-info grande">Selecione uma solicitação à esquerda.</div>}
          {sel && (
            <>
              <div className="sol-det-head">
                <div className="ava lg"><UserIcon size={28} /></div>
                <div>
                  <h2>{sel.alvo.nome}</h2>
                  <p>Matrícula {sel.alvo.matricula || "—"} · {TIPO_LABEL[sel.tipo] || sel.tipo}</p>
                </div>
                <span className={`sc-status st-${sel.status}`}>
                  {sel.status === "pendente" ? "Pendente" : sel.status === "aprovada" ? "Aprovada" : "Devolvida"}
                </span>
              </div>

              <div className="sol-sec">
                <span className="sol-sec-t">Mudanças solicitadas</span>
                <div className="sol-diff-lista">
                  {(sel.payload?.mudancas || []).map((m, i) => {
                    const atualVal = m.campo === "cargo" ? sel.atual.cargo
                      : (m.campo === "area" || m.campo === "setor") ? sel.atual.setor
                      : m.campo === "situacao" ? sel.atual.situacao
                      : m.campo === "lider" ? sel.atual.lider : m.de;
                    return (
                      <div className="sol-diff" key={i}>
                        <span className="sd-campo">{CAMPO_LABEL[m.campo] || m.campo}</span>
                        <span className="sd-de">{(sel.status === "pendente" ? atualVal : m.de) || "—"}</span>
                        <span className="sd-seta">→</span>
                        <span className="sd-para">{m.para || "—"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="sol-meta">
                <div><span>Solicitante</span><b>{sel.payload?.solicitante || "—"}</b></div>
                <div><span>Aberta em</span><b>{quando(sel.criadoEm)}</b></div>
                {sel.dataDecisao && <div><span>Decidida em</span><b>{quando(sel.dataDecisao)}</b></div>}
              </div>

              {sel.payload?.observacao && (
                <div className="sol-sec">
                  <span className="sol-sec-t">Observação do solicitante</span>
                  <p className="sol-texto">{sel.payload.observacao}</p>
                </div>
              )}
              {sel.status === "devolvida" && sel.payload?.decisao && (
                <div className="sol-sec">
                  <span className="sol-sec-t">Motivo da devolução</span>
                  <p className="sol-texto devolucao">{sel.payload.decisao}</p>
                </div>
              )}

              {erro && <div className="modal-alert"><AlertIcon size={16} /><div><b>{erro}</b></div></div>}

              {sel.status === "pendente" && (
                <div className="sol-acoes">
                  {devolvendo ? (
                    <div className="sol-devolver">
                      <textarea rows={2} placeholder="Motivo da devolução (opcional)" value={obsDevolver} onChange={(e) => setObsDevolver(e.target.value)} />
                      <div className="sol-devolver-btns">
                        <button className="btn btn-neutral" onClick={() => setDevolvendo(false)}>Voltar</button>
                        <button className="btn btn-ghost" disabled={agindo} onClick={() => agir({ acao: "devolver", id: sel.id, observacao: obsDevolver })}>
                          {agindo ? "Devolvendo..." : "Confirmar devolução"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button className="btn btn-ghost" onClick={() => setDevolvendo(true)}><span className="ic"><CloseIcon /></span>Devolver</button>
                      <div style={{ flex: 1 }} />
                      <button className="btn btn-primary" disabled={agindo} onClick={() => agir({ acao: "aprovar", id: sel.id })}>
                        <span className="ic"><CheckIcon /></span>{agindo ? "Aplicando..." : "Aprovar e aplicar"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
