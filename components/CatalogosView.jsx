"use client";

// Catálogos da base — edição dos dados que NÃO são de colaboradores:
// áreas, cargos, níveis hierárquicos, locais, regionais e situações.
// Regras de integridade (a API valida de novo, esta tela orienta):
//  * códigos NÃO são editáveis: ao criar, o sistema gera o próximo da
//    sequência oficial do banco (SET…, LOCTRA…, NH…, número, letra livre);
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
    usoTxt: (n) => `${n} colab.`,
    campos: [
      { k: "nome", label: "Nome", obrig: true },
      { k: "codigo", label: "Código DP", auto: true },
    ],
    avisoExcluir: (it) =>
      `${it.usos} colaborador(es) ficarão sem área (saem do organograma até serem realocados). ` +
      `Se esta área é uma duplicata, prefira mesclar em "Gerenciar áreas" — a mescla move as pessoas em vez de desvincular.`,
  },
  {
    key: "cargos", tipo: "cargo", label: "Cargos", singular: "cargo",
    usoTxt: (n) => `${n} colab.`,
    campos: [
      { k: "nome", label: "Nome", obrig: true },
      { k: "codigo", label: "Cód. Cargo", auto: true },
      { k: "nivelId", label: "Nível hierárquico", tipo: "nivel" },
    ],
    avisoExcluir: (it) => `${it.usos} colaborador(es) ficarão com "cargo a definir".`,
  },
  {
    key: "niveis", tipo: "nivel", label: "Níveis", singular: "nível",
    usoTxt: (n) => `${n} cargo(s)`,
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
    usoTxt: (n) => `${n} colab.`,
    campos: [
      { k: "nome", label: "Nome", obrig: true },
      { k: "codigo", label: "Código DP", auto: true },
    ],
    avisoExcluir: (it) => `${it.usos} colaborador(es) ficarão sem local de trabalho.`,
  },
  {
    key: "regionais", tipo: "regional", label: "Regionais", singular: "regional",
    usoTxt: (n) => `${n} colab.`,
    campos: [{ k: "nome", label: "Nome", obrig: true }],
    avisoExcluir: (it) => `${it.usos} colaborador(es) ficarão sem regional.`,
  },
  {
    key: "situacoes", tipo: "situacao", label: "Situações", singular: "situação",
    usoTxt: (n) => `${n} colab.`,
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

  function tituloDe(item) {
    if (abaKey === "niveis") return item.familia || item.codigo || "Sem família";
    return item.nome;
  }

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

        {/* formulário de NOVO registro */}
        {editando === "novo" && (
          <div className="ar-item ct-editando">
            <b className="ct-form-titulo">Nova {aba.singular}</b>
            <FormCampos aba={aba} form={form} setForm={setForm} niveis={dados?.niveis || []} />
            {erroForm && <div className="ct-erro"><AlertIcon size={13} /> {erroForm}</div>}
            <div className="ar-acoes" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-neutral btn-sm" onClick={fecharForm}>Cancelar</button>
              <button className="btn btn-primary btn-sm" disabled={agindo} onClick={salvar}>
                <span className="ic"><CheckIcon /></span>{agindo ? "Salvando..." : "Criar"}
              </button>
            </div>
          </div>
        )}

        <div className="ar-lista">
          {carregando && <div className="ar-vazio">Carregando catálogos...</div>}
          {!carregando && itens.length === 0 && <div className="ar-vazio">Nenhum registro encontrado.</div>}

          {itens.map((item) => (
            <div key={item.id} className={`ar-item ${editando === item.id ? "ct-editando" : ""}`}>
              <div className="ar-info">
                <span className="ar-nome">
                  {tituloDe(item)}
                  {item.codigo && <code className="ct-code">{item.codigo}</code>}
                  {abaKey === "niveis" && <span className="ct-meta">ordem {item.ordem}{item.variacao ? ` · var. ${item.variacao}` : ""}</span>}
                  {abaKey === "cargos" && item.nivelId && <span className="ct-meta">{nomeNivel(item.nivelId)}</span>}
                  {abaKey === "situacoes" && (
                    <span className={`ct-meta ${item.ativoArvore ? "ok" : "off"}`}>
                      {item.ativoArvore ? "visível no organograma" : "oculta do organograma"}
                    </span>
                  )}
                </span>
                <span className="ar-count">{aba.usoTxt(item.usos)}</span>
              </div>

              {editando !== item.id && confirmandoDel !== item.id && (
                <div className="ar-acoes">
                  <button className="ar-btn" onClick={() => abrirEdicao(item)}><PencilIcon size={12} /> Editar</button>
                  <button className="ar-btn ct-del" onClick={() => { setConfirmandoDel(item.id); setEditando(null); setMsg(""); }}>
                    <CloseIcon size={12} /> Excluir
                  </button>
                </div>
              )}

              {editando === item.id && (
                <>
                  <FormCampos aba={aba} form={form} setForm={setForm} niveis={dados?.niveis || []} />
                  {erroForm && <div className="ct-erro"><AlertIcon size={13} /> {erroForm}</div>}
                  <div className="ar-acoes" style={{ justifyContent: "flex-end" }}>
                    <button className="btn btn-neutral btn-sm" onClick={fecharForm}>Cancelar</button>
                    <button className="btn btn-primary btn-sm" disabled={agindo} onClick={salvar}>
                      <span className="ic"><CheckIcon /></span>{agindo ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </>
              )}

              {confirmandoDel === item.id && (
                <div className="ct-del-confirma">
                  <div className="ar-merge-aviso">
                    <AlertIcon size={14} />
                    <span>
                      <b>Excluir &quot;{tituloDe(item)}&quot;?</b>{" "}
                      {item.usos > 0 ? aba.avisoExcluir(item) : "Nenhum vínculo será afetado."}{" "}
                      Os colaboradores em si <b>não são apagados</b> — só o vínculo com este registro.
                    </span>
                  </div>
                  <div className="ar-acoes" style={{ justifyContent: "flex-end" }}>
                    <button className="btn btn-neutral btn-sm" onClick={() => setConfirmandoDel(null)}>Cancelar</button>
                    <button className="btn btn-ghost btn-sm" disabled={agindo} onClick={() => excluir(item)}>
                      {agindo ? "Excluindo..." : `Excluir${item.usos > 0 ? ` e desvincular ${item.usos}` : ""}`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// campos do formulário, montados a partir da configuração da aba
function FormCampos({ aba, form, setForm, niveis }) {
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
                placeholder="gerado pelo sistema ao criar"
                disabled
                title="O código segue a sequência oficial do banco e não é editável."
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
