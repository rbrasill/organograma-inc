"use client";

// Gerenciamento de usuários e perfis de acesso (só ADMIN).
// Todo usuário nasce no perfil PADRÃO (só visualização) e NÃO aparece aqui:
// o admin busca um colaborador da base, promove (Colaborador/Gestor/Admin) e
// ele passa a ser listado. Remover devolve ao padrão e some da lista.
// A mudança vale a partir do PRÓXIMO login do usuário (perfil é claim da sessão).

import { useCallback, useEffect, useState } from "react";
import HeroNav from "@/components/HeroNav";
import { PERFIS_PROMOVIDOS, ROTULO } from "@/lib/perfis";
import { SearchIcon, AlertIcon, PlusIcon, CloseIcon, UserIcon } from "@/components/icons";

export default function AcessosView() {
  const [promovidos, setPromovidos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [agindo, setAgindo] = useState(false);
  const [confirmandoDel, setConfirmandoDel] = useState(null); // colaborador da lista

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/acessos");
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Falha ao carregar.");
      setPromovidos(j.promovidos);
    } catch (e) { setErro(e.message); setPromovidos([]); }
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // busca com debounce para promover alguém da base
  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) { setResultados([]); setBuscando(false); return; }
    let vivo = true; setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/acessos?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        if (vivo) setResultados(j.ok ? j.resultados : []);
      } catch { if (vivo) setResultados([]); }
      if (vivo) setBuscando(false);
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [busca]);

  async function post(payload) {
    const r = await fetch("/api/acessos", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const txt = await r.text();
    try { return JSON.parse(txt); } catch { return { ok: false, erro: `Servidor respondeu ${r.status}.` }; }
  }

  async function definir(colaboradorId, perfil, nome) {
    setAgindo(true); setErro(""); setMsg("");
    const j = await post({ acao: "definir", colaboradorId, perfil });
    setAgindo(false);
    if (!j.ok) { setErro(j.erro || "Falha ao definir o perfil."); return; }
    setMsg(`${nome} agora é ${ROTULO[perfil]} — vale a partir do próximo login dele(a).`);
    setBusca(""); setResultados([]);
    carregar();
  }

  async function remover(item) {
    setAgindo(true); setErro(""); setMsg("");
    const j = await post({ acao: "remover", colaboradorId: item.id });
    setAgindo(false); setConfirmandoDel(null);
    if (!j.ok) { setErro(j.erro || "Falha ao remover."); return; }
    setMsg(`${item.nome} voltou ao perfil padrão (só visualização).`);
    carregar();
  }

  return (
    <div className="sol-shell">
      <HeroNav
        titulo="Perfis de acesso"
        subtitulo="Promova usuários a Colaborador, Gestor ou Administrador · quem está no padrão vê apenas o organograma"
        atual="acessos"
      />

      <div className="ct-board">
        {/* busca para promover alguém da base */}
        <div className="ct-topo">
          <div className="sol-busca ct-busca">
            <SearchIcon size={14} />
            <input
              placeholder="Buscar colaborador por nome ou matrícula para dar acesso..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        {(buscando || resultados.length > 0) && (
          <div className="ar-lista" style={{ marginBottom: 16 }}>
            {buscando && <div className="ar-vazio">Buscando...</div>}
            {!buscando && resultados.map((r) => (
              <div key={r.id} className="ar-item">
                <div className="ar-info">
                  <span className="ar-nome">
                    <span className="ac-ava"><UserIcon size={14} /></span> {r.nome}
                    {r.matricula && <code className="ct-code">{r.matricula}</code>}
                    <span className="ct-meta">{r.cargo || "Cargo a definir"}</span>
                    {r.perfil && <span className="ct-pill on">{ROTULO[r.perfil]}</span>}
                  </span>
                </div>
                <div className="ar-acoes">
                  {PERFIS_PROMOVIDOS.map((p) => (
                    <button
                      key={p} className="ar-btn" disabled={agindo || r.perfil === p}
                      title={r.perfil === p ? "Já está neste perfil" : `Definir como ${ROTULO[p]}`}
                      onClick={() => definir(r.id, p, r.nome)}
                    >
                      <PlusIcon size={11} /> {ROTULO[p]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {erro && <div className="modal-alert"><AlertIcon size={16} /><div><b>{erro}</b></div></div>}
        {msg && <div className="modal-note sol-ok"><b>{msg}</b></div>}

        {carregando && <div className="ar-vazio">Carregando...</div>}
        {!carregando && promovidos.length === 0 && (
          <div className="ar-vazio">
            Nenhum usuário com perfil elevado ainda — todos estão no padrão (só visualização).
            Busque acima para promover o primeiro.
          </div>
        )}

        {!carregando && promovidos.length > 0 && (
          <div className="ct-tabela-wrap">
            <table className="ct-tabela">
              <thead>
                <tr>
                  <th>Nome</th><th>Matrícula</th><th>Cargo</th><th>Perfil</th><th className="ct-col-acoes">Ações</th>
                </tr>
              </thead>
              <tbody>
                {promovidos.map((p) => (
                  <tr key={p.id}>
                    <td className="td-nome">{p.nome}{p.ativo === 0 && <span className="ct-meta off"> · desativado</span>}</td>
                    <td>{p.matricula || <span className="ct-vazio">—</span>}</td>
                    <td>{p.cargo || <span className="ct-vazio">—</span>}</td>
                    <td>
                      <select
                        value={p.perfil} disabled={agindo}
                        onChange={(e) => definir(p.id, e.target.value, p.nome)}
                        title="Trocar o perfil — vale a partir do próximo login"
                      >
                        {PERFIS_PROMOVIDOS.map((x) => <option key={x} value={x}>{ROTULO[x]}</option>)}
                      </select>
                    </td>
                    <td className="ct-col-acoes">
                      {confirmandoDel === p.id ? (
                        <div className="ct-acoes-cel">
                          <button className="btn btn-neutral btn-sm" onClick={() => setConfirmandoDel(null)}>Cancelar</button>
                          <button className="btn btn-ghost btn-sm" disabled={agindo} onClick={() => remover(p)}>
                            Voltar ao padrão
                          </button>
                        </div>
                      ) : (
                        <button className="ar-btn ct-del" title="Remover o perfil (volta ao padrão, só visualização)"
                          onClick={() => setConfirmandoDel(p.id)}>
                          <CloseIcon size={12} /> Remover
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="login-nota" style={{ marginTop: 14 }}>
          A mudança de perfil vale a partir do <b>próximo login</b> do usuário (a sessão dura até 8h).
          Quem está no perfil padrão não aparece na lista — apenas visualiza o organograma.
        </p>
      </div>
    </div>
  );
}
