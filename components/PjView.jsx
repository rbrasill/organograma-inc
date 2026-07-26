"use client";

// Gestão dedicada de colaboradores PJ (PJ = tipo de contratação da pessoa,
// não uma empresa). Lista só os PJ, permite cadastrar novos, editar (inclui
// CPF e telefone), trocar situação/área/cargo/líder, ativar/desativar e
// EXCLUIR de vez. Usa /api/colaboradores/gestao (tipo=PJ + ações criar/excluir).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HeroNav from "@/components/HeroNav";
import { normalizar } from "@/data/ti";
import { formatarCpf, cpfValido, soDigitos } from "@/lib/cpf";
import {
  OBRIGATORIOS_NOVO, OBRIGATORIOS_EDICAO, validarColaborador, mensagemValidacao,
} from "@/lib/validacao";
import {
  UserIcon, BriefcaseIcon, CheckIcon, AlertIcon, SearchIcon, ChevronIcon, PlusIcon, CloseIcon,
} from "@/components/icons";

const rotuloNivel = (n) =>
  n ? `${n.codVar || `${n.ordem}${n.variacao ? `.${n.variacao}` : ""}`} · ${n.familia || n.codigo || "—"}` : "";

const VAZIO = {
  matricula: "", nome: "", cpf: "", telefone: "", email: "",
  dataNascimento: "", dataAdmissao: "",
  situacaoId: "", cargoId: "", nivelId: "", setorId: "", regionalId: "", localId: "",
  liderMatricula: "", liderNome: "", ativo: 1,
};

export default function PjView() {
  const [listas, setListas] = useState(null);
  const [bootErro, setBootErro] = useState("");
  const [pjs, setPjs] = useState([]);
  const [incluirInativos, setIncluirInativos] = useState(false);
  const [busca, setBusca] = useState("");
  const [carregandoLista, setCarregandoLista] = useState(true);

  const [modo, setModo] = useState(null); // null | "novo" | <id>
  const [form, setForm] = useState(null);
  const [carregandoDet, setCarregandoDet] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [agindo, setAgindo] = useState(false);
  // só destaca campo em branco depois da primeira tentativa de salvar
  // (não "grita" com o formulário recém-aberto)
  const [tentou, setTentou] = useState(false);

  const [liderPicker, setLiderPicker] = useState(false);
  const [liderBusca, setLiderBusca] = useState("");
  const [liderResultados, setLiderResultados] = useState([]);
  const [liderBuscando, setLiderBuscando] = useState(false);
  const liderRef = useRef(null);

  // bootstrap: listas para os selects
  useEffect(() => {
    fetch("/api/colaboradores/gestao")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setListas(j.listas); else setBootErro(j.erro || "Falha ao carregar."); })
      .catch((e) => setBootErro(`Falha ao carregar: ${e.message}`));
  }, []);

  const carregarLista = useCallback(async () => {
    setCarregandoLista(true);
    try {
      const p = new URLSearchParams({ tipo: "PJ" });
      if (incluirInativos) p.set("incluirInativos", "1");
      const r = await fetch(`/api/colaboradores/gestao?${p.toString()}`);
      const j = await r.json();
      setPjs(j.ok ? j.colaboradores : []);
    } catch { setPjs([]); }
    setCarregandoLista(false);
  }, [incluirInativos]);
  useEffect(() => { carregarLista(); }, [carregarLista]);

  const listaFiltrada = useMemo(() => {
    const nq = normalizar(busca.trim());
    if (!nq) return pjs;
    return pjs.filter((p) => normalizar(p.nome).includes(nq) || normalizar(p.cargo || "").includes(nq) || (p.matricula || "").includes(busca.trim()));
  }, [pjs, busca]);

  // ===== nível (cascata código do cargo → variação) =====
  const nivelPorId = useCallback((id) => (listas?.niveis || []).find((n) => n.id === id) || null, [listas]);
  const variacoesDe = useCallback((ordem) => (listas?.niveis || []).filter((n) => String(n.ordem) === String(ordem)), [listas]);
  const nivelDoCargo = useCallback((cargoId) => nivelPorId((listas?.cargos || []).find((c) => c.id === cargoId)?.nivelId), [listas, nivelPorId]);
  const nomeDe = useCallback((lista, id) => (listas?.[lista] || []).find((x) => x.id === id)?.nome || "", [listas]);

  // todo cadastro novo nasce "Ativo" — a situação não é escolhida no cadastro
  // (o servidor força a mesma regra); na edição volta a ser editável.
  const situacaoAtivo = useMemo(
    () => (listas?.situacoes || []).find((s) => normalizar(s.nome) === "ativo") || null,
    [listas]
  );
  useEffect(() => {
    if (modo !== "novo" || !situacaoAtivo) return;
    setForm((f) => (f && !f.situacaoId ? { ...f, situacaoId: situacaoAtivo.id } : f));
  }, [modo, situacaoAtivo]);

  function set(campo, valor) { setForm((f) => ({ ...f, [campo]: valor })); setMsg(""); }
  function trocaCargo(cargoId) {
    const cg = (listas?.cargos || []).find((c) => c.id === cargoId);
    setForm((f) => ({ ...f, cargoId, nivelId: cg?.nivelId || "" })); setMsg("");
  }

  function novo() {
    setModo("novo");
    setForm({ ...VAZIO, situacaoId: situacaoAtivo?.id || "" });
    setErro(""); setMsg(""); setConfirmDel(false); setLiderPicker(false); setTentou(false);
  }
  const abrir = useCallback(async (id) => {
    setModo(id); setForm(null); setErro(""); setMsg(""); setConfirmDel(false); setLiderPicker(false); setTentou(false);
    setCarregandoDet(true);
    try {
      const r = await fetch(`/api/colaboradores/gestao?id=${encodeURIComponent(id)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Falha ao carregar.");
      const c = j.colaborador;
      setForm({
        matricula: c.codigo_dp || "", nome: c.nome || "",
        cpf: formatarCpf(c.cpf || ""), telefone: c.telefone || "", email: c.email || "",
        dataNascimento: c.data_nascimento || "", dataAdmissao: c.data_admissao || "",
        situacaoId: c.situacao_id || "", cargoId: c.cargo_id || "",
        nivelId: c.nivel_pessoal_id || c.cargo_nivel_id || "",
        setorId: c.setor_id || "", regionalId: c.regional_id || "", localId: c.local_id || "",
        liderMatricula: c.lider_mat || "", liderNome: c.lider_nome || "", ativo: c.ativo,
      });
    } catch (e) { setErro(e.message); }
    setCarregandoDet(false);
  }, []);

  // picker de líder (busca em toda a base)
  useEffect(() => {
    if (!liderPicker) return;
    let ativo = true; setLiderBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/colaboradores?q=${encodeURIComponent(liderBusca)}&excluir=${encodeURIComponent(form?.matricula || "")}`);
        const j = await r.json();
        if (ativo) setLiderResultados(j.ok ? j.resultados : []);
      } catch { if (ativo) setLiderResultados([]); }
      if (ativo) setLiderBuscando(false);
    }, 250);
    return () => { ativo = false; clearTimeout(t); };
  }, [liderBusca, liderPicker, form?.matricula]);
  useEffect(() => {
    if (!liderPicker) return;
    function fora(e) { if (liderRef.current && !liderRef.current.contains(e.target)) setLiderPicker(false); }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [liderPicker]);

  async function post(payload) {
    try {
      const r = await fetch("/api/colaboradores/gestao", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const txt = await r.text();
      try { return JSON.parse(txt); } catch { return { ok: false, erro: `Servidor respondeu ${r.status}.` }; }
    } catch (e) { return { ok: false, erro: `Falha de rede: ${e.message}` }; }
  }

  async function salvar() {
    setTentou(true);
    // mesma régua da API (@/lib/validacao): cadastro novo exige o núcleo
    // completo; na edição só o que não trava registro antigo
    const v = validarColaborador(form, { novo: modo === "novo" });
    if (!v.ok) { setErro(mensagemValidacao(v)); return; }
    setSalvando(true); setErro("");
    // envia o CPF só com dígitos (o banco guarda assim; é como o login casa)
    const campos = { ...form, cpf: soDigitos(form.cpf), tipo: "PJ" };
    const j = modo === "novo"
      ? await post({ acao: "criar", campos })
      : await post({ acao: "salvar", id: modo, campos });
    setSalvando(false);
    if (!j.ok) { setErro(j.erro || "Falha ao salvar."); return; }
    await carregarLista();
    setMsg(modo === "novo" ? "PJ cadastrado." : "Alterações salvas.");
    if (modo === "novo" && j.colaborador?.id) { abrir(j.colaborador.id); }
  }

  async function mudarAtivo(acao) {
    setAgindo(true); setErro("");
    const j = await post({ acao, id: modo });
    setAgindo(false);
    if (!j.ok) { setErro(j.erro || "Falha."); return; }
    setForm((f) => ({ ...f, ativo: acao === "reativar" ? 1 : 0 }));
    await carregarLista();
    setMsg(acao === "reativar" ? "PJ reativado." : `PJ desativado.${j.reapontados ? ` ${j.reapontados} subordinado(s) reapontado(s).` : ""}`);
  }

  async function excluir() {
    setAgindo(true); setErro("");
    const j = await post({ acao: "excluir", id: modo });
    setAgindo(false);
    if (!j.ok) { setErro(j.erro || "Falha ao excluir."); setConfirmDel(false); return; }
    setConfirmDel(false); setModo(null); setForm(null);
    await carregarLista();
    setMsg(`PJ excluído em definitivo.${j.reapontados ? ` ${j.reapontados} subordinado(s) reapontado(s).` : ""}`);
  }

  const padraoNivel = form ? nivelDoCargo(form.cargoId) : null;
  const somenteLeitura = form && modo !== "novo" && form.ativo === 0;
  // CPF: inválido só quando já tem os 11 dígitos e não passa na validação
  // (não "grita" enquanto o usuário ainda está digitando)
  const cpfInvalido = form ? soDigitos(form.cpf).length === 11 && !cpfValido(form.cpf) : false;

  // ===== obrigatoriedade (mesma régua da API) =====
  const cadastroNovo = modo === "novo";
  const obrigatorios = cadastroNovo ? OBRIGATORIOS_NOVO : OBRIGATORIOS_EDICAO;
  const validacao = form ? validarColaborador(form, { novo: cadastroNovo }) : null;
  const exigido = (campo) => obrigatorios.includes(campo);
  // problema a destacar no campo: só depois de tentar salvar
  const problema = (campo) => {
    if (!tentou || !validacao) return "";
    if (validacao.faltantes.includes(campo)) return "obrigatório";
    return validacao.erros[campo] || "";
  };
  const classe = (campo) => (problema(campo) ? "input-invalido" : "");
  // rótulo com o marcador * e o aviso do que está errado no campo
  const rot = (texto, campo, extra = null) => (
    <span>
      {texto}
      {exigido(campo) && <em className="fld-obrig" title="Campo obrigatório"> *</em>}
      {extra}
      {problema(campo) && <em className="fld-erro"> · {problema(campo)}</em>}
    </span>
  );

  return (
    <div className="sol-shell">
      <HeroNav
        titulo="Colaboradores PJ"
        subtitulo="Cadastrar, editar, alterar status, ativar/desativar e excluir prestadores PJ"
        atual="pj"
      />

      <div className="sol-board">
        {/* LISTA */}
        <aside className="sol-lista-wrap">
          <div className="col-filtros">
            <button className="btn btn-primary" onClick={novo}>
              <span className="ic"><PlusIcon size={13} /></span>Novo PJ
            </button>
            <div className="sol-busca">
              <SearchIcon size={14} />
              <input placeholder="Buscar por nome, cargo ou matrícula..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <label className="col-inativos">
              <input type="checkbox" checked={incluirInativos} onChange={(e) => setIncluirInativos(e.target.checked)} />
              Mostrar desativados
            </label>
          </div>

          <div className="sol-lista">
            {bootErro && <div className="sol-info erro"><AlertIcon size={18} /><span>{bootErro}</span></div>}
            {carregandoLista && <div className="sol-info">Carregando...</div>}
            {!carregandoLista && listaFiltrada.length === 0 && <div className="sol-info">Nenhum PJ encontrado.</div>}
            {listaFiltrada.map((c) => (
              <button key={c.id} className={`sol-card ${modo === c.id ? "sel" : ""} ${c.ativo === 0 ? "inativo" : ""}`} onClick={() => abrir(c.id)}>
                <span className="sc-ava"><BriefcaseIcon size={17} /></span>
                <span className="sc-txt">
                  <b>{c.nome}{c.ativo === 0 && <span className="col-tag-off">desativado</span>}</b>
                  <em>{c.cargo || "Cargo a definir"}</em>
                  <small>{c.matricula}{c.setor ? ` · ${c.setor}` : ""}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* DETALHE / FORM */}
        <section className="sol-detalhe">
          {!modo && <div className="sol-info grande">Selecione um PJ à esquerda ou clique em "Novo PJ".</div>}
          {modo && carregandoDet && <div className="sol-info grande">Carregando...</div>}

          {modo && !carregandoDet && form && (
            <>
              <div className="sol-det-head">
                <div className="ava lg"><BriefcaseIcon size={26} /></div>
                <div>
                  <h2>{modo === "novo" ? "Novo colaborador PJ" : (form.nome || "—")}</h2>
                  <p>Matrícula {modo === "novo" ? "(gerada ao salvar)" : (form.matricula || "—")}</p>
                </div>
                {modo !== "novo" && (form.ativo === 0
                  ? <span className="col-edit-tag off">Desativado</span>
                  : <span className="col-edit-tag"><BriefcaseIcon size={13} /> PJ</span>)}
              </div>

              {erro && <div className="modal-alert"><AlertIcon size={16} /><div><b>{erro}</b></div></div>}
              {msg && <div className="modal-note sol-ok"><b>{msg}</b></div>}
              {somenteLeitura && (
                <div className="modal-note col-arquivado">
                  <b>PJ desativado — somente visualização.</b> Reative para editar.
                </div>
              )}

              <fieldset className="col-form" disabled={somenteLeitura}>
                {cadastroNovo && (
                  <p className="col-obrig-nota">
                    Campos com <em className="fld-obrig">*</em> são obrigatórios — o cadastro só é criado
                    com o núcleo completo (nome, CPF, cargo, área, regional, líder e admissão).
                  </p>
                )}
                <label className="fld">{rot("Nome", "nome")}
                  <input value={form.nome} className={classe("nome")} onChange={(e) => set("nome", e.target.value)} /></label>
                <div className="col-grid2">
                  <label className="fld">
                    {rot("CPF", "cpf", cpfInvalido && !problema("cpf") ? <em className="fld-erro"> · CPF inválido</em> : null)}
                    <input
                      value={form.cpf}
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                      className={cpfInvalido || problema("cpf") ? "input-invalido" : ""}
                      onChange={(e) => set("cpf", formatarCpf(e.target.value))}
                    />
                  </label>
                  <label className="fld">{rot("Telefone", "telefone")}
                    <input value={form.telefone} className={classe("telefone")} placeholder="(00) 00000-0000" onChange={(e) => set("telefone", e.target.value)} /></label>
                </div>
                <label className="fld">{rot("E-mail", "email")}
                  <input value={form.email} className={classe("email")} placeholder="nome@meuinc.com.br" onChange={(e) => set("email", e.target.value)} /></label>
                <div className="col-grid2">
                  <label className="fld">{rot("Data de nascimento", "dataNascimento")}
                    <input type="date" value={form.dataNascimento} className={classe("dataNascimento")} onChange={(e) => set("dataNascimento", e.target.value)} /></label>
                  <label className="fld">{rot("Data de admissão", "dataAdmissao", <em className="ct-ex"> · quando foi contratado</em>)}
                    <input type="date" value={form.dataAdmissao} className={classe("dataAdmissao")} onChange={(e) => set("dataAdmissao", e.target.value)} /></label>
                </div>
                <div className="col-grid2">
                  <label className="fld">
                    {rot("Situação", "situacaoId", cadastroNovo ? <em className="ct-ex"> · entra como Ativo</em> : null)}
                    <select
                      value={form.situacaoId}
                      className={classe("situacaoId")}
                      disabled={cadastroNovo}
                      title={cadastroNovo ? "Todo cadastro novo entra como Ativo — altere depois, se precisar." : ""}
                      onChange={(e) => set("situacaoId", e.target.value)}
                    >
                      <option value="">— selecione —</option>
                      {(listas?.situacoes || []).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select></label>
                  <label className="fld">{rot("Cargo", "cargoId")}
                    <select value={form.cargoId} className={classe("cargoId")} onChange={(e) => trocaCargo(e.target.value)}>
                      <option value="">— selecione —</option>
                      {(listas?.cargos || []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select></label>
                </div>
                <label className="fld">
                  <span>Variação da família{padraoNivel ? <em className="ct-ex"> · nível {padraoNivel.ordem} (definido pelo cargo)</em> : null}</span>
                  <select value={form.nivelId} disabled={!form.cargoId || !padraoNivel} onChange={(e) => set("nivelId", e.target.value)}>
                    <option value="">— selecione —</option>
                    {(padraoNivel ? variacoesDe(padraoNivel.ordem) : []).map((n) => <option key={n.id} value={n.id}>{rotuloNivel(n)}</option>)}
                  </select>
                </label>
                <div className="col-grid2">
                  <label className="fld">{rot("Área / Setor", "setorId")}
                    <select value={form.setorId} className={classe("setorId")} onChange={(e) => set("setorId", e.target.value)}>
                      <option value="">— selecione —</option>
                      {(listas?.setores || []).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select></label>
                  <label className="fld">{rot("Regional", "regionalId")}
                    <select value={form.regionalId} className={classe("regionalId")} onChange={(e) => set("regionalId", e.target.value)}>
                      <option value="">— selecione —</option>
                      {(listas?.regionais || []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
                    </select></label>
                </div>
                <label className="fld">{rot("Local de trabalho", "localId")}
                  <select value={form.localId} className={classe("localId")} onChange={(e) => set("localId", e.target.value)}>
                    <option value="">— selecione —</option>
                    {(listas?.locais || []).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select></label>

                <div className="fld fld-lider" ref={liderRef}>
                  {rot("Líder direto", "liderMatricula")}
                  <div className={`lider-atual ${problema("liderMatricula") ? "campo-invalido" : ""}`}>
                    <span className="la-ava"><UserIcon size={20} /></span>
                    <span className="la-txt">
                      <b>{form.liderNome || "Sem líder (topo)"}</b>
                      <em>{form.liderMatricula ? `Matrícula ${form.liderMatricula}` : "Não responde a ninguém"}</em>
                    </span>
                    <button type="button" className="la-btn" onClick={() => { setLiderBusca(""); setLiderResultados([]); setLiderPicker(true); }}>
                      Trocar <ChevronIcon size={12} />
                    </button>
                  </div>
                  {liderPicker && (
                    <div className="lider-pop">
                      <div className="lider-pick">
                        <span className="lp-ic"><SearchIcon size={14} /></span>
                        <input autoFocus placeholder="Buscar o líder (todas as áreas)..." value={liderBusca} onChange={(e) => setLiderBusca(e.target.value)} />
                      </div>
                      <div className="lider-list">
                        {/* no cadastro novo o líder é obrigatório: não oferece "sem líder" */}
                        {!cadastroNovo && (
                          <button type="button" className="ll-item" onClick={() => { set("liderMatricula", ""); setForm((f) => ({ ...f, liderNome: "" })); setLiderPicker(false); }}>
                            <b>— Sem líder (topo)</b>
                          </button>
                        )}
                        {liderResultados.map((l) => (
                          <button type="button" key={l.matricula} className="ll-item" onClick={() => { setForm((f) => ({ ...f, liderMatricula: l.matricula, liderNome: l.nome })); setLiderPicker(false); }}>
                            <b>{l.nome}</b><em>{(l.cargo || "Cargo a definir")}{l.setor ? ` · ${l.setor}` : ""}</em>
                          </button>
                        ))}
                        {liderBuscando && <div className="ll-vazio">Buscando...</div>}
                        {!liderBuscando && liderResultados.length === 0 && (
                          <div className="ll-vazio">{liderBusca ? `Nada encontrado para "${liderBusca}"` : "Digite para buscar"}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </fieldset>

              {/* zona de status/exclusão (só na edição, não no cadastro novo) */}
              {modo !== "novo" && (
                <div className="col-perigo">
                  {confirmDel ? (
                    <div className="cp-confirma">
                      <b className="cp-tit"><AlertIcon size={14} /> Excluir {form.nome} em definitivo?</b>
                      <p className="sol-texto">
                        Remove o cadastro do banco para sempre (irreversível). Subordinados diretos, se houver,
                        sobem para o líder acima; registros ligados a ele são limpos. Para apenas afastar
                        temporariamente, use <b>Desativar</b>.
                      </p>
                      <div className="cp-acoes">
                        <button className="btn btn-neutral btn-sm" onClick={() => setConfirmDel(false)}>Cancelar</button>
                        <button className="btn btn-ghost btn-sm" disabled={agindo} onClick={excluir}>
                          {agindo ? "Excluindo..." : "Excluir em definitivo"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="cp-linha">
                      <div className="cp-txt">
                        <b>{form.ativo === 0 ? "Reativar cadastro" : "Status do cadastro"}</b>
                        <em>{form.ativo === 0 ? "Traz o PJ de volta ao organograma e à busca." : "Desativar arquiva (reversível); excluir remove de vez."}</em>
                      </div>
                      {form.ativo === 0 ? (
                        <button className="btn btn-neutral" disabled={agindo} onClick={() => mudarAtivo("reativar")}>
                          {agindo ? "Reativando..." : "Reativar"}
                        </button>
                      ) : (
                        <>
                          <button className="btn btn-neutral btn-sm" disabled={agindo} onClick={() => mudarAtivo("desativar")}>Desativar</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setErro(""); setMsg(""); setConfirmDel(true); }}>Excluir</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {!somenteLeitura && (
                <div className="col-foot">
                  {modo !== "novo" && <button className="btn btn-neutral" onClick={() => setModo(null)}>Fechar</button>}
                  <div style={{ flex: 1 }} />
                  <button className="btn btn-primary" disabled={salvando} onClick={salvar}>
                    <span className="ic"><CheckIcon /></span>
                    {salvando ? "Salvando..." : (modo === "novo" ? "Cadastrar PJ" : "Salvar alterações")}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
