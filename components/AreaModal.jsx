"use client";

// Painel de gestão de áreas (setor) — Fase 1: renomear + mesclar.
// Tira o RH de dentro do banco: corrige nome com typo e junta duplicatas
// (movendo os colaboradores para a área correta).

import { useEffect, useState } from "react";
import { CloseIcon, AlertIcon, CheckIcon, PencilIcon, MergeIcon, GridIcon } from "@/components/icons";

export default function AreaModal({ onClose, onMudou }) {
  const [areas, setAreas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState("");
  const [mergeId, setMergeId] = useState(null);   // área origem (será absorvida)
  const [mergeDest, setMergeDest] = useState(""); // área destino

  async function carregar() {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/areas");
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Falha ao carregar áreas.");
      setAreas(j.areas);
    } catch (e) { setErro(e.message); }
    setCarregando(false);
  }
  useEffect(() => { carregar(); }, []);

  async function post(payload) {
    const r = await fetch("/api/areas", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const txt = await r.text();
    try { return JSON.parse(txt); } catch { return { ok: false, erro: `Servidor respondeu ${r.status}.` }; }
  }

  function abrirEdicao(a) { setMergeId(null); setEditId(a.id); setEditNome(a.nome); setErro(""); setAviso(""); }
  function abrirMerge(a) { setEditId(null); setMergeId(a.id); setMergeDest(""); setErro(""); setAviso(""); }

  async function salvarNome(id) {
    setSalvando(true); setErro("");
    const j = await post({ acao: "renomear", id, nome: editNome });
    setSalvando(false);
    if (!j.ok) { setErro(j.erro); return; }
    setEditId(null); setAviso("Área renomeada.");
    await carregar(); onMudou?.();
  }

  async function confirmarMerge(origemId) {
    if (!mergeDest) { setErro("Escolha a área de destino."); return; }
    setSalvando(true); setErro("");
    const j = await post({ acao: "mesclar", origemId, destinoId: mergeDest });
    setSalvando(false);
    if (!j.ok) { setErro(j.erro); return; }
    setMergeId(null);
    setAviso(`Áreas mescladas — ${j.movidos} pessoa(s) movida(s).`);
    await carregar(); onMudou?.();
  }

  const nomeDe = (id) => areas.find((a) => a.id === id)?.nome || "";

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal area-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label="Fechar"><CloseIcon size={16} /></button>

        <div className="modal-head">
          <div className="imp-ico"><GridIcon size={22} /></div>
          <div>
            <h3>Gerenciar áreas</h3>
            <p>Renomeie para corrigir typos · mescle para juntar áreas duplicadas</p>
          </div>
        </div>

        <div className="modal-body">
          {erro && <div className="modal-alert"><AlertIcon size={16} /><div><b>{erro}</b></div></div>}
          {aviso && <div className="modal-note">{aviso}</div>}

          {carregando && <p className="ar-vazio">Carregando áreas...</p>}
          {!carregando && areas.length === 0 && !erro && (
            <p className="ar-vazio">Nenhuma área cadastrada ainda — importe a base pelo Excel.</p>
          )}

          <div className="ar-lista">
            {areas.map((a) => (
              <div key={a.id} className="ar-item">
                {editId === a.id ? (
                  <div className="ar-edit">
                    <input value={editNome} autoFocus onChange={(e) => setEditNome(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && salvarNome(a.id)} />
                    <button className="btn btn-primary btn-sm" disabled={salvando} onClick={() => salvarNome(a.id)}>
                      <span className="ic"><CheckIcon size={12} /></span>Salvar
                    </button>
                    <button className="btn btn-neutral btn-sm" onClick={() => setEditId(null)}>Cancelar</button>
                  </div>
                ) : mergeId === a.id ? (
                  <div className="ar-merge">
                    <div className="ar-merge-top">
                      <span>Mesclar <b>{a.nome}</b> em:</span>
                      <select value={mergeDest} onChange={(e) => setMergeDest(e.target.value)}>
                        <option value="">— escolha a área destino —</option>
                        {areas.filter((o) => o.id !== a.id).map((o) => (
                          <option key={o.id} value={o.id}>{o.nome}</option>
                        ))}
                      </select>
                    </div>
                    {mergeDest && (
                      <div className="ar-merge-aviso">
                        <AlertIcon size={13} /> {a.pessoas} pessoa(s) de <b>{a.nome}</b> passam para <b>{nomeDe(mergeDest)}</b>, e <b>{a.nome}</b> é removida. Nada é apagado dos colaboradores.
                      </div>
                    )}
                    <div className="ar-merge-acoes">
                      <button className="btn btn-neutral btn-sm" onClick={() => setMergeId(null)}>Cancelar</button>
                      <button className="btn btn-primary btn-sm" disabled={salvando || !mergeDest} onClick={() => confirmarMerge(a.id)}>
                        {salvando ? "Mesclando..." : "Confirmar mescla"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="ar-info">
                      <span className="ar-nome">{a.nome}</span>
                      <span className="ar-count">{a.pessoas} pessoa{a.pessoas === 1 ? "" : "s"}</span>
                    </div>
                    <div className="ar-acoes">
                      <button className="ar-btn" onClick={() => abrirEdicao(a)} title="Renomear"><PencilIcon size={14} /> Renomear</button>
                      <button className="ar-btn" onClick={() => abrirMerge(a)} title="Mesclar em outra área"><MergeIcon size={14} /> Mesclar</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="modal-foot">
          <div style={{ flex: 1 }} />
          <button className="btn btn-neutral" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
