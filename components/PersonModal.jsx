"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { nivelDe, NIVEIS, inconsistenciasDe, CARGOS, AREAS, LOCAIS, normalizar } from "@/data/ti";
import { UserIcon, CloseIcon, AlertIcon, SearchIcon, ChevronIcon, CheckIcon } from "@/components/icons";

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
  // líder: id (matrícula) + info de exibição (funciona mesmo se o líder é de
  // outra área, pois não depende do índice byId, que é só da área atual).
  // liderOriginalInfo guarda o líder de partida enriquecido (cargo/setor
  // vêm de /api/colaboradores quando o líder é de fora da área carregada).
  const [liderOriginalInfo, setLiderOriginalInfo] = useState({
    matricula: pessoa.lider || "",
    nome: pessoa.liderNome || pessoa.lider || "",
    cargo: "",
    setor: "",
  });
  const [liderId, setLiderId] = useState(pessoa.lider || "");
  const [liderInfo, setLiderInfo] = useState(pessoa.lider ? liderOriginalInfo : null);
  const [liderBusca, setLiderBusca] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [pickerAberto, setPickerAberto] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erroSol, setErroSol] = useState("");
  const [confirmandoSol, setConfirmandoSol] = useState(false); // painel de confirmação da solicitação
  const [obs, setObs] = useState("");
  const [enviandoSol, setEnviandoSol] = useState(false);
  const [solEnviada, setSolEnviada] = useState(false);
  const pickerRef = useRef(null);
  const buscaRef = useRef(null);

  const nivel = nivelDe(cargo);
  const cor = NIVEIS[nivel - 1].cor;
  const alertas = inconsistenciasDe(pessoa, byId);

  const liderOriginalId = pessoa.lider || "";
  const liderOriginalNome = pessoa.liderNome || "";
  const mudouLider = liderId !== liderOriginalId;

  // busca os dados completos (cargo/setor) do líder original, que podem não
  // estar disponíveis se ele for de outra área (só vem o nome via a API do organograma)
  useEffect(() => {
    if (!pessoa.lider) return;
    let ativo = true;
    fetch(`/api/colaboradores?matricula=${encodeURIComponent(pessoa.lider)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!ativo || !j.ok || !j.pessoa) return;
        const enriquecido = {
          matricula: pessoa.lider,
          nome: j.pessoa.nome || pessoa.liderNome || pessoa.lider,
          cargo: j.pessoa.cargo || "",
          setor: j.pessoa.setor || "",
        };
        setLiderOriginalInfo(enriquecido);
        setLiderInfo((atual) => (atual && atual.matricula === pessoa.lider ? enriquecido : atual));
      })
      .catch(() => {});
    return () => { ativo = false; };
  }, [pessoa.lider, pessoa.liderNome]);

  // busca de líderes em TODO o banco (não só na área atual), com debounce
  useEffect(() => {
    if (!pickerAberto) return;
    let ativo = true;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/colaboradores?q=${encodeURIComponent(liderBusca)}&excluir=${encodeURIComponent(pessoa.id)}`);
        const j = await r.json();
        if (ativo) setResultados(j.ok ? j.resultados : []);
      } catch { if (ativo) setResultados([]); }
      if (ativo) setBuscando(false);
    }, 250);
    return () => { ativo = false; clearTimeout(t); };
  }, [liderBusca, pickerAberto, pessoa.id]);

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
    setResultados([]);
    setPickerAberto(true);
  }
  // res = objeto {matricula, nome, cargo, setor} ou null para "sem líder"
  function escolherLider(res) {
    setLiderId(res ? res.matricula : "");
    setLiderInfo(res || null);
    setPickerAberto(false);
    setLiderBusca("");
  }
  function desfazerTroca() {
    setLiderId(liderOriginalId);
    setLiderInfo(liderOriginalId ? liderOriginalInfo : null);
    setPickerAberto(false);
    setLiderBusca("");
  }

  function salvar() {
    onSalvar({ ...pessoa, nome, local, email });
    onClose();
  }

  // diferenças estruturais (cargo, área, líder) vs. o estado atual
  const mudancas = useMemo(() => {
    const ms = [];
    if ((cargo || "") !== (pessoa.cargo || ""))
      ms.push({ campo: "cargo", de: pessoa.cargo || "—", para: cargo || "—" });
    if ((area || "") !== (areaAtual || ""))
      ms.push({ campo: "area", de: areaAtual || "—", para: area || "—" });
    if (liderId !== liderOriginalId) {
      ms.push({
        campo: "lider",
        de: liderOriginalNome || "Sem líder (topo)",
        para: liderInfo ? liderInfo.nome : "Sem líder (topo)",
        paraMatricula: liderId || "",
      });
    }
    return ms;
  }, [cargo, area, liderId, pessoa.cargo, areaAtual, liderOriginalId, liderOriginalNome, liderInfo]);

  function abrirConfirmacao() {
    setErroSol("");
    if (mudancas.length === 0) {
      setErroSol("Nenhuma mudança estrutural para solicitar. Altere cargo, área ou líder primeiro.");
      return;
    }
    setConfirmandoSol(true);
  }

  async function enviarSolicitacao() {
    setEnviandoSol(true);
    setErroSol("");
    const tipo = mudancas.some((m) => m.campo === "area") ? "mudanca_area"
      : mudancas.some((m) => m.campo === "cargo") ? "mudanca_cargo" : "correcao_vinculo";
    try {
      const r = await fetch("/api/solicitacoes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "criar", matricula: pessoa.id, alvoNome: pessoa.nome,
          solicitanteNome: "Líder (protótipo)", observacao: obs, mudancas, tipo,
        }),
      });
      const txt = await r.text();
      let j; try { j = JSON.parse(txt); } catch { j = { ok: false, erro: `Servidor respondeu ${r.status}.` }; }
      if (!j.ok) { setErroSol(j.erro || "Falha ao enviar."); setEnviandoSol(false); return; }
      setSolEnviada(true);
      setConfirmandoSol(false);
    } catch (e) {
      setErroSol(`Falha ao enviar: ${e.message}`);
    }
    setEnviandoSol(false);
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
                <b>{liderInfo ? liderInfo.nome : "Sem líder (topo da área)"}</b>
                <em>{liderInfo ? (liderInfo.cargo || (liderInfo.setor ? liderInfo.setor : "—")) : "Não responde a ninguém"}</em>
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
                Novo líder selecionado — líder atual: <b>{liderOriginalNome || "Sem líder (topo)"}</b>.
                A troca só é aplicada após aprovação do RH.
              </div>
            )}

            {pickerAberto && (
              <div className="lider-pop">
                <div className="lider-pick">
                  <span className="lp-ic"><SearchIcon size={14} /></span>
                  <input
                    ref={buscaRef}
                    placeholder="Buscar pelo nome do líder (todas as áreas)..."
                    value={liderBusca}
                    onChange={(e) => setLiderBusca(e.target.value)}
                  />
                </div>
                <div className="lp-hint">Busca em todas as áreas — o novo líder pode ser de outro setor.</div>
                <div className="lider-list">
                  <button className={`ll-item ${liderId === "" ? "sel" : ""}`} onClick={() => escolherLider(null)}>
                    <b>— Sem líder (topo da área)</b>
                  </button>
                  {resultados.map((l) => (
                    <button key={l.matricula} className={`ll-item ${liderId === l.matricula ? "sel" : ""}`} onClick={() => escolherLider(l)}>
                      <b>{l.nome}</b><em>{(l.cargo || "Cargo a definir")}{l.setor ? ` · ${l.setor}` : ""}</em>
                    </button>
                  ))}
                  {buscando && <div className="ll-vazio">Buscando...</div>}
                  {!buscando && resultados.length === 0 && (
                    <div className="ll-vazio">
                      {liderBusca ? `Nenhuma pessoa encontrada para "${liderBusca}"` : "Digite para buscar em todas as áreas"}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {erroSol && <div className="modal-alert"><AlertIcon size={16} /><div><b>{erroSol}</b></div></div>}
        {aviso && <div className="modal-note">{aviso}</div>}

        {solEnviada && (
          <div className="modal-note sol-ok">
            <b>Solicitação enviada ao RH.</b> Ela aparece em "Solicitações" para aprovação — as mudanças estruturais só valem depois de aprovadas.
          </div>
        )}

        {confirmandoSol && (
          <div className="sol-confirma">
            <b className="sol-titulo">Enviar solicitação de ajuste ao RH</b>
            <ul className="sol-diffs">
              {mudancas.map((m) => (
                <li key={m.campo}>
                  <span className="sol-campo">{m.campo === "area" ? "Área" : m.campo === "lider" ? "Líder" : "Cargo"}</span>
                  <span className="sol-de">{m.de}</span>
                  <span className="sol-seta">→</span>
                  <span className="sol-para">{m.para}</span>
                </li>
              ))}
            </ul>
            <textarea
              className="sol-obs" rows={2} value={obs} placeholder="Observação para o RH (opcional)"
              onChange={(e) => setObs(e.target.value)}
            />
          </div>
        )}
        </div>

        <div className="modal-foot">
          {confirmandoSol ? (
            <>
              <button className="btn btn-neutral" onClick={() => setConfirmandoSol(false)}>Voltar</button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-primary" disabled={enviandoSol} onClick={enviarSolicitacao}>
                <span className="ic"><CheckIcon /></span>{enviandoSol ? "Enviando..." : "Enviar solicitação"}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={abrirConfirmacao} disabled={solEnviada}>
                Solicitar ajuste{mudancas.length ? ` (${mudancas.length})` : ""}
              </button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-neutral" onClick={onClose}>{solEnviada ? "Fechar" : "Cancelar"}</button>
              <button className="btn btn-primary" onClick={salvar}>Salvar</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
