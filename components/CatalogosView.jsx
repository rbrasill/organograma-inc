"use client";

// Catálogos da base — edição dos dados que NÃO são de colaboradores:
// áreas, cargos, níveis hierárquicos, locais, regionais e situações.
// Criar/editar acontece num MODAL (popup) — a lista fica só para consulta,
// busca e ações.
// Regras de integridade (a API valida de novo, esta tela orienta):
//  * códigos NÃO são editáveis: ao criar, o sistema gera o próximo da
//    sequência oficial do banco (SET…, NH…, número, letra livre); o código
//    de LOCAL é o número da obra no DP e entra pela importação (mig. 06);
//    ao editar, o código aparece fixo (somente visualização);
//  * nomes não podem duplicar (a normalização evita "TI" vs "T.I ");
//  * excluir desfaz os vínculos de forma controlada (nada fica órfão) e
//    mostra ANTES quantas pessoas/cargos serão desvinculados.

import { useCallback, useEffect, useMemo, useState } from "react";
import HeroNav from "@/components/HeroNav";
import { normalizar } from "@/data/ti";
import {
  SearchIcon, AlertIcon, CheckIcon, PlusIcon, PencilIcon, CloseIcon,
} from "@/components/icons";

const ABAS = [
  {
    key: "setores", tipo: "setor", label: "Áreas", singular: "área",
    colunas: [
      { titulo: "Área", tipo: "nome", k: "nome" },
      { titulo: "Local", tipo: "local" },
      { titulo: "Código", tipo: "codigo" },
      { titulo: "Colaboradores", k: "usos" },
    ],
    campos: [
      { k: "nome", label: "Nome", obrig: true },
      { k: "codigo", label: "Código DP", auto: true },
      { k: "localId", label: "Local vinculado (obra/unidade)", tipo: "local" },
    ],
    avisoExcluir: (it) =>
      `${it.usos} colaborador(es) ficarão sem área (saem do organograma até serem realocados). ` +
      `Se esta área é uma duplicata, primeiro mova as pessoas para a área correta (Editar colaboradores ou reimportação) e exclua depois.`,
  },
  {
    key: "cargos", tipo: "cargo", label: "Cargos", singular: "cargo",
    colunas: [
      { titulo: "Cargo", tipo: "nome", k: "nome" },
      { titulo: "Nível hierárquico", tipo: "nivel" },
      { titulo: "Código", tipo: "codigo" },
      { titulo: "Colaboradores", k: "usos" },
    ],
    campos: [
      { k: "nome", label: "Nome", obrig: true },
      { k: "codigo", label: "Código (nº do cargo no DP)", auto: true, dica: "vem do extrato do DP na importação" },
      { k: "nivelId", label: "Nível hierárquico", tipo: "nivel" },
    ],
    avisoExcluir: (it) => `${it.usos} colaborador(es) ficarão com "cargo a definir".`,
  },
  {
    key: "niveis", tipo: "nivel", label: "Níveis", singular: "nível",
    colunas: [
      { titulo: "Família", tipo: "nome", valor: (i) => i.familia || "—" },
      { titulo: "Ordem", k: "ordem" },
      { titulo: "Variação", valor: (i) => i.variacao || "—" },
      { titulo: "Código", tipo: "codigo" },
      { titulo: "Cargos", k: "usos" },
    ],
    campos: [
      { k: "familia", label: "Família", ex: "Gerente" },
      { k: "codigo", label: "Código NH", auto: true },
      { k: "ordem", label: "Ordem (1 = topo)", tipo: "int", obrig: true },
      { k: "variacao", label: "Variação", ex: "A" },
      { k: "codVar", label: "Cód. variação", ex: "6.A" },
    ],
    avisoExcluir: (it) =>
      `${it.usos} cargo(s) ficarão sem nível vinculado — os colaboradores desses cargos perdem o degrau no desenho do organograma.`,
  },
  {
    key: "locais", tipo: "local", label: "Locais", singular: "local",
    colunas: [
      { titulo: "Local", tipo: "nome", k: "nome" },
      { titulo: "Código", tipo: "codigo" },
      { titulo: "Colaboradores", k: "usos" },
    ],
    campos: [
      { k: "nome", label: "Nome", obrig: true },
      { k: "codigo", label: "Código (nº da obra no DP)", auto: true, dica: "vem do extrato do DP na importação" },
    ],
    avisoExcluir: (it) => `${it.usos} colaborador(es) ficarão sem local de trabalho.`,
  },
  {
    key: "regionais", tipo: "regional", label: "Regionais", singular: "regional",
    colunas: [
      { titulo: "Regional", tipo: "nome", k: "nome" },
      { titulo: "Colaboradores", k: "usos" },
    ],
    campos: [{ k: "nome", label: "Nome", obrig: true }],
    avisoExcluir: (it) => `${it.usos} colaborador(es) ficarão sem regional.`,
  },
  {
    key: "situacoes", tipo: "situacao", label: "Situações", singular: "situação",
    colunas: [
      { titulo: "Situação", tipo: "nome", k: "nome" },
      { titulo: "Código", tipo: "codigo" },
      { titulo: "Na árvore", tipo: "arvore" },
      { titulo: "Colaboradores", k: "usos" },
    ],
    campos: [
      { k: "nome", label: "Nome", obrig: true },
      { k: "codigo", label: "Código (letra)", auto: true },
      { k: "ativoArvore", label: "Aparece na árvore do organograma", tipo: "bool" },
    ],
    avisoExcluir: (it) =>
      `${it.usos} colaborador(es) ficarão sem situação (entram com alerta de inconsistência). ` +
      `A situação também sai da lista aceita pela importação.`,
  },
];

export default function CatalogosView() {
  const [dados, setDados] = useState(null);
  const [erroGeral, setErroGeral] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [abaKey, setAbaKey] = useState("setores");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState(null); // id do item, ou "novo"
  const [form, setForm] = useState({});
  const [erroForm, setErroForm] = useState("");
  const [confirmandoDel, setConfirmandoDel] = useState(null); // id
  const [agindo, setAgindo] = useState(false);
  const [msg, setMsg] = useState("");

  const aba = ABAS.find((a) => a.key === abaKey);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroGeral("");
    try {
      const r = await fetch("/api/catalogos");
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Falha ao carregar os catálogos.");
      setDados(j);
    } catch (e) {
      setErroGeral(e.message);
      setDados(null);
    }
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const itens = useMemo(() => {
    const lista = dados?.[abaKey] || [];
    const q = normalizar(busca.trim());
    if (!q) return lista;
    return lista.filter((it) =>
      normalizar(it.nome || "").includes(q) ||
      normalizar(it.codigo || "").includes(q) ||
      normalizar(it.familia || "").includes(q)
    );
  }, [dados, abaKey, busca]);

  function trocarAba(k) {
    setAbaKey(k); setBusca(""); setEditando(null); setConfirmandoDel(null); setErroForm(""); setMsg("");
  }

  function abrirEdicao(item) {
    const f = {};
    aba.campos.forEach((c) => { f[c.k] = item[c.k] ?? (c.tipo === "bool" ? 1 : ""); });
    setForm(f); setEditando(item.id); setConfirmandoDel(null); setErroForm(""); setMsg("");
  }
  function abrirNovo() {
    const f = {};
    aba.campos.forEach((c) => { f[c.k] = c.tipo === "bool" ? 1 : ""; });
    setForm(f); setEditando("novo"); setConfirmandoDel(null); setErroForm(""); setMsg("");
  }
  function fecharForm() { setEditando(null); setErroForm(""); }

  // validação local (a API revalida — esta é para o feedback imediato)
  function validarLocal() {
    for (const c of aba.campos) {
      const v = String(form[c.k] ?? "").trim();
      if (c.obrig && !v) return `Preencha "${c.label}".`;
      if (c.rx && v && !c.rx.test(v.toUpperCase()))
        return `"${c.label}" fora do padrão do banco — formato esperado: ${c.ex}.`;
      if (c.tipo === "int") {
        const n = parseInt(v, 10);
        if (!Number.isInteger(n) || n < 1 || n > 18)
          return `"${c.label}" deve ser um número de 1 (topo) a 18.`;
      }
    }
    return "";
  }

  async function post(payload) {
    const r = await fetch("/api/catalogos", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const txt = await r.text();
    try { return JSON.parse(txt); } catch { return { ok: false, erro: `Servidor respondeu ${r.status}.` }; }
  }

  async function salvar() {
    const erro = validarLocal();
    if (erro) { setErroForm(erro); return; }
    setAgindo(true); setErroForm("");
    const j = await post({
      acao: editando === "novo" ? "criar" : "salvar",
      tipo: aba.tipo, id: editando === "novo" ? undefined : editando, campos: form,
    });
    setAgindo(false);
    if (!j.ok) { setErroForm(j.erro || "Falha ao salvar."); return; }
    setEditando(null);
    setMsg(editando === "novo" ? `Nova ${aba.singular} criada.` : "Alterações salvas.");
    carregar();
  }

  async function excluir(item) {
    setAgindo(true); setErroForm("");
    const j = await post({ acao: "excluir", tipo: aba.tipo, id: item.id });
    setAgindo(false);
    if (!j.ok) { setErroGeral(j.erro || "Falha ao excluir."); setConfirmandoDel(null); return; }
    setConfirmandoDel(null);
    setMsg(`Registro excluído. ${j.desvinculados} vínculo(s) desfeito(s) de forma controlada.`);
    carregar();
  }

  const nomeNivel = useCallback((id) => {
    const n = (dados?.niveis || []).find((x) => x.id === id);
    return n ? `${n.codigo || "?"} · ${n.familia || "—"} (ordem ${n.ordem})` : "";
  }, [dados]);

  // renderiza uma célula da tabela conforme o tipo da coluna
  const vazio = (t) => <span className="ct-vazio">{t}</span>;
  function celula(col, item) {
    if (col.tipo === "codigo") return item.codigo ? <code className="ct-code">{item.codigo}</code> : vazio("—");
    if (col.tipo === "nivel") { const t = nomeNivel(item.nivelId); return t || vazio("— sem nível —"); }
    if (col.tipo === "local") return item.localNome || vazio("— sem local —");
    if (col.tipo === "arvore")
      return <span className={`ct-pill ${item.ativoArvore ? "on" : "off"}`}>{item.ativoArvore ? "Visível" : "Oculta"}</span>;
    return col.valor ? col.valor(item) : item[col.k];
  }

  function tituloDe(item) {
    if (abaKey === "niveis") return item.familia || item.codigo || "Sem família";
    return item.nome;
  }

  // item aberto no modal de edição (null quando criando)
  const itemEditando =
    editando && editando !== "novo" ? (dados?.[abaKey] || []).find((i) => i.id === editando) : null;
  // item aguardando confirmação de exclusão
  const itemDel = confirmandoDel ? (dados?.[abaKey] || []).find((i) => i.id === confirmandoDel) : null;

  return (
    <div className="sol-shell">
      <HeroNav
        titulo="Catálogos da base"
        subtitulo="Áreas, cargos, níveis, locais, regionais e situações · edição com validação de formato"
        atual="catalogos"
      />

      <div className="ct-board">
        <div className="sol-filtros">
          {ABAS.map((a) => (
            <button key={a.key} className={`sol-tab ${abaKey === a.key ? "on" : ""}`} onClick={() => trocarAba(a.key)}>
              {a.label}{dados ? ` (${(dados[a.key] || []).length})` : ""}
            </button>
          ))}
        </div>

        <div className="ct-topo">
          <div className="sol-busca ct-busca">
            <SearchIcon size={14} />
            <input placeholder={`Buscar em ${aba.label.toLowerCase()}...`} value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={abrirNovo}>
            <span className="ic"><PlusIcon size={12} /></span>Novo
          </button>
        </div>

        {erroGeral && <div className="modal-alert"><AlertIcon size={16} /><div><b>{erroGeral}</b></div></div>}
        {msg && <div className="modal-note sol-ok"><b>{msg}</b></div>}

        {carregando && <div className="ar-vazio">Carregando catálogos...</div>}
        {!carregando && itens.length === 0 && <div className="ar-vazio">Nenhum registro encontrado.</div>}

        {/* todos os catálogos em formato de tabela — colunas por aba */}
        {!carregando && itens.length > 0 && (
          <div className="ct-tabela-wrap">
            <table className="ct-tabela">
              <thead>
                <tr>
                  {aba.colunas.map((c) => <th key={c.titulo}>{c.titulo}</th>)}
                  <th className="ct-col-acoes">Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <tr key={item.id}>
                    {aba.colunas.map((c, i) => (
                      <td key={i} className={c.tipo === "nome" ? "td-nome" : ""}>{celula(c, item)}</td>
                    ))}
                    <td className="ct-col-acoes">
                      <div className="ct-acoes-cel">
                        <button className="btn btn-primary btn-sm" onClick={() => abrirEdicao(item)}>
                          <span className="ic"><PencilIcon size={12} /></span> Editar
                        </button>
                        <button className="ar-btn ct-del" title={`Excluir ${aba.singular}`}
                          onClick={() => { setConfirmandoDel(item.id); setEditando(null); setMsg(""); }}>
                          <CloseIcon size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* modal de criação/edição — a lista fica só para consulta e ações */}
      {editando && (
        <div className="modal-overlay" onMouseDown={fecharForm}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-x" onClick={fecharForm} aria-label="Fechar"><CloseIcon size={16} /></button>
            <div className="modal-head">
              <div className="imp-ico">{editando === "novo" ? <PlusIcon size={22} /> : <PencilIcon size={22} />}</div>
              <div>
                <h3>{editando === "novo" ? `Nova ${aba.singular}` : `Editar ${aba.singular}`}</h3>
                <p>{editando === "novo" ? `Catálogos → ${aba.label}` : tituloDe(itemEditando || {})}</p>
              </div>
            </div>
            <div className="modal-body">
              <FormCampos aba={aba} form={form} setForm={setForm} niveis={dados?.niveis || []} locais={dados?.locais || []} />
              {erroForm && <div className="ct-erro"><AlertIcon size={13} /> {erroForm}</div>}
            </div>
            <div className="modal-foot" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-neutral" onClick={fecharForm}>Cancelar</button>
              <button className="btn btn-primary" disabled={agindo} onClick={salvar}>
                <span className="ic"><CheckIcon /></span>
                {agindo ? "Salvando..." : editando === "novo" ? "Criar" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* modal de confirmação de exclusão */}
      {itemDel && (
        <div className="modal-overlay" onMouseDown={() => setConfirmandoDel(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-x" onClick={() => setConfirmandoDel(null)} aria-label="Fechar"><CloseIcon size={16} /></button>
            <div className="modal-head">
              <div className="imp-ico" style={{ background: "#fbdcd9", color: "#b42318" }}><AlertIcon size={20} /></div>
              <div>
                <h3>Excluir {aba.singular}?</h3>
                <p>{tituloDe(itemDel)}</p>
              </div>
            </div>
            <div className="modal-body">
              <p className="ct-del-txt">
                {itemDel.usos > 0 ? aba.avisoExcluir(itemDel) : "Nenhum vínculo será afetado."}{" "}
                Os colaboradores em si <b>não são apagados</b> — só o vínculo com este registro.
              </p>
            </div>
            <div className="modal-foot" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-neutral" onClick={() => setConfirmandoDel(null)}>Cancelar</button>
              <button className="btn btn-ghost" disabled={agindo} onClick={() => excluir(itemDel)}>
                {agindo ? "Excluindo..." : `Excluir${itemDel.usos > 0 ? ` e desvincular ${itemDel.usos}` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// campos do formulário, montados a partir da configuração da aba
function FormCampos({ aba, form, setForm, niveis, locais }) {
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="ct-form">
      {aba.campos.map((c) => {
        // código sequencial: o sistema gera na criação e ele fica imutável
        if (c.auto) {
          return (
            <label key={c.k} className="fld">
              <span>{c.label} <em className="ct-ex">· automático</em></span>
              <input
                value={form[c.k] ?? ""}
                placeholder={c.dica || "gerado pelo sistema ao criar"}
                disabled
                title={c.dica || "O código segue a sequência oficial do banco e não é editável."}
              />
            </label>
          );
        }
        if (c.tipo === "bool") {
          return (
            <label key={c.k} className="ct-check">
              <input type="checkbox" checked={!!form[c.k]} onChange={(e) => set(c.k, e.target.checked ? 1 : 0)} />
              {c.label}
            </label>
          );
        }
        if (c.tipo === "local") {
          return (
            <label key={c.k} className="fld">
              <span>{c.label}</span>
              <select value={form[c.k] || ""} onChange={(e) => set(c.k, e.target.value)}>
                <option value="">— sem local vinculado —</option>
                {(locais || []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo ? `${l.codigo} · ` : ""}{l.nome}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        if (c.tipo === "nivel") {
          return (
            <label key={c.k} className="fld">
              <span>{c.label}</span>
              <select value={form[c.k] || ""} onChange={(e) => set(c.k, e.target.value)}>
                <option value="">— sem nível —</option>
                {niveis.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.codigo || "?"} · {n.familia || "—"} (ordem {n.ordem}{n.variacao ? `.${n.variacao}` : ""})
                  </option>
                ))}
              </select>
            </label>
          );
        }
        return (
          <label key={c.k} className="fld">
            <span>{c.label}{c.ex ? <em className="ct-ex"> · ex.: {c.ex}</em> : null}</span>
            <input
              value={form[c.k] ?? ""}
              inputMode={c.tipo === "int" ? "numeric" : undefined}
              onChange={(e) => set(c.k, c.rx ? e.target.value.toUpperCase() : e.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
}
