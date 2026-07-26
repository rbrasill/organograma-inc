"use client";

// Tela administrativa para localizar e editar colaboradores direto no banco.
// Fluxo: filtra por área e/ou nome → seleciona a pessoa → edita os campos →
// confirma → grava (POST /api/colaboradores/gestao). Sem histórico (decisão
// do produto). Layout mestre-detalhe, no mesmo padrão de /solicitacoes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HeroNav from "@/components/HeroNav";
import {
  OBRIGATORIOS_EDICAO, PENDENCIAS_EDICAO,
  validarColaborador, mensagemValidacao, listarRotulos,
} from "@/lib/validacao";
import {
  UserIcon, CheckIcon, AlertIcon, ChevronIcon, SearchIcon, PencilIcon,
} from "@/components/icons";

const CAMPOS_LABEL = {
  nome: "Nome", email: "E-mail", tipo: "Contratação", cargo: "Cargo",
  setor: "Área / Setor", local: "Local de trabalho", regional: "Regional",
  situacao: "Situação", lider: "Líder direto", nivel: "Nível do cargo",
  dataNascimento: "Data de nascimento", dataAdmissao: "Data de admissão",
};

// "YYYY-MM-DD" → "DD/MM/AAAA" (para os diffs de confirmação)
const dataBR = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};

// rótulo de um nível hierárquico: "14.E · Secretária"
const rotuloNivel = (n) =>
  n ? `${n.codVar || `${n.ordem}${n.variacao ? `.${n.variacao}` : ""}`} · ${n.familia || n.codigo || "—"}` : "";

export default function ColaboradoresView() {
  const [areas, setAreas] = useState([]);
  const [listas, setListas] = useState(null);
  const [bootErro, setBootErro] = useState("");
  const [carregandoBoot, setCarregandoBoot] = useState(true);

  // filtros de busca
  const [areaFiltro, setAreaFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [incluirInativos, setIncluirInativos] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [buscaFeita, setBuscaFeita] = useState(false);

  // desativar / reativar
  const [confirmandoDesativar, setConfirmandoDesativar] = useState(false);
  const [processandoAtivo, setProcessandoAtivo] = useState(false);
  const [msgAtivo, setMsgAtivo] = useState("");

  // seleção + edição
  const [selId, setSelId] = useState(null);
  const [original, setOriginal] = useState(null); // snapshot resolvido (nomes)
  const [form, setForm] = useState(null);          // ids/valores editáveis
  const [carregandoDet, setCarregandoDet] = useState(false);
  const [erro, setErro] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  // erro de FORMATO (e-mail, datas) só aparece depois de tentar salvar — não
  // fica vermelho no meio da digitação. Campo obrigatório esvaziado avisa na hora.
  const [tentou, setTentou] = useState(false);

  // picker de líder
  const [liderPicker, setLiderPicker] = useState(false);
  const [liderBusca, setLiderBusca] = useState("");
  const [liderResultados, setLiderResultados] = useState([]);
  const [liderBuscando, setLiderBuscando] = useState(false);
  const liderRef = useRef(null);

  // ---- bootstrap: áreas + listas ----
  useEffect(() => {
    fetch("/api/colaboradores/gestao")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) { setBootErro(j.erro || "Falha ao carregar."); return; }
        setAreas(j.areas || []);
        setListas(j.listas || null);
      })
      .catch((e) => setBootErro(`Falha ao carregar: ${e.message}`))
      .finally(() => setCarregandoBoot(false));
  }, []);

  // ---- busca (área + nome), com debounce ----
  useEffect(() => {
    if (!areaFiltro && busca.trim().length < 2) { setResultados([]); setBuscaFeita(false); return; }
    let ativo = true;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const p = new URLSearchParams();
        if (areaFiltro) p.set("setor", areaFiltro);
        if (busca.trim()) p.set("q", busca.trim());
        if (incluirInativos) p.set("incluirInativos", "1");
        const r = await fetch(`/api/colaboradores/gestao?${p.toString()}`);
        const j = await r.json();
        if (ativo) { setResultados(j.ok ? j.colaboradores : []); setBuscaFeita(true); }
      } catch { if (ativo) setResultados([]); }
      if (ativo) setBuscando(false);
    }, 250);
    return () => { ativo = false; clearTimeout(t); };
  }, [areaFiltro, busca, incluirInativos]);

  // ---- picker de líder: busca em todas as áreas ----
  useEffect(() => {
    if (!liderPicker) return;
    let ativo = true;
    setLiderBuscando(true);
    const t = setTimeout(async () => {
      try {
        const excluir = form?.matricula || "";
        const r = await fetch(`/api/colaboradores?q=${encodeURIComponent(liderBusca)}&excluir=${encodeURIComponent(excluir)}`);
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
    function esc(e) { if (e.key === "Escape") setLiderPicker(false); }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [liderPicker]);

  // ===== variação da família (nível hierárquico) =====
  // O CÓDIGO do nível vem do cargo (editável só no catálogo, para todos);
  // aqui o usuário escolhe apenas a VARIAÇÃO dentro desse nível (8.A, 8.B...),
  // que vale só para este colaborador.
  const nivelPorId = useCallback(
    (id) => (listas?.niveis || []).find((n) => n.id === id) || null,
    [listas]
  );
  const variacoesDe = useCallback(
    (ordem) => (listas?.niveis || []).filter((n) => String(n.ordem) === String(ordem)),
    [listas]
  );
  // nível padrão do cargo selecionado no formulário (define o código)
  const nivelDoCargo = useCallback(
    (cargoId) => nivelPorId((listas?.cargos || []).find((c) => c.id === cargoId)?.nivelId),
    [listas, nivelPorId]
  );

  const selecionar = useCallback(async (id) => {
    setSelId(id);
    setErro(""); setConfirmando(false); setSalvo(false); setLiderPicker(false);
    setConfirmandoDesativar(false); setMsgAtivo(""); setTentou(false);
    setCarregandoDet(true); setForm(null); setOriginal(null);
    try {
      const r = await fetch(`/api/colaboradores/gestao?id=${encodeURIComponent(id)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Falha ao carregar o colaborador.");
      const c = j.colaborador;
      // nível EFETIVO: variação própria da pessoa; senão, o padrão do cargo
      const nivelEfetivo = c.nivel_pessoal_id || c.cargo_nivel_id || "";
      setForm({
        matricula: c.codigo_dp || "",
        nome: c.nome || "",
        email: c.email || "",
        cpf: c.cpf || "", // exibição apenas — não é enviado no salvar
        dataNascimento: c.data_nascimento || "", // CLT: só visualização (vem do DP)
        dataAdmissao: c.data_admissao || "",
        tipo: c.tipo_contratacao || "CLT",
        cargoId: c.cargo_id || "",
        setorId: c.setor_id || "",
        localId: c.local_id || "",
        regionalId: c.regional_id || "",
        situacaoId: c.situacao_id || "",
        liderMatricula: c.lider_mat || "",
        liderNome: c.lider_nome || "",
        nivelId: nivelEfetivo,
        ativo: c.ativo,
        subordinados: c.subordinados || 0,
      });
      setOriginal({
        nome: c.nome || "", email: c.email || "", tipo: c.tipo_contratacao || "CLT",
        cargo: c.cargo || "", setor: c.setor || "", local: c.local || "",
        regional: c.regional || "", situacao: c.situacao || "",
        liderMatricula: c.lider_mat || "", liderNome: c.lider_nome || "",
        nivelId: nivelEfetivo,
        dataNascimento: c.data_nascimento || "", dataAdmissao: c.data_admissao || "",
      });
    } catch (e) { setErro(e.message); }
    setCarregandoDet(false);
  }, [nivelPorId]);

  // trocar o cargo traz junto a variação padrão dele (o usuário pode então
  // escolher outra variação da MESMA família/nível, se houver)
  function trocaCargo(cargoId) {
    const cg = (listas?.cargos || []).find((c) => c.id === cargoId);
    setForm((f) => ({ ...f, cargoId, nivelId: cg?.nivelId || "" }));
    setSalvo(false);
  }

  // áreas em ordem alfabética pelo nome (acentos tratados via pt-BR)
  const areasOrdenadas = useMemo(
    () => [...areas].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })),
    [areas]
  );

  const nomeDe = useCallback((lista, id) => (listas?.[lista] || []).find((x) => x.id === id)?.nome || "", [listas]);

  // diferenças (para a confirmação) — compara nomes resolvidos com o snapshot
  const mudancas = useMemo(() => {
    if (!form || !original) return [];
    const ms = [];
    if (form.nome.trim() !== original.nome) ms.push({ campo: "nome", de: original.nome || "—", para: form.nome.trim() || "—" });
    if ((form.email || "").trim() !== original.email) ms.push({ campo: "email", de: original.email || "—", para: form.email.trim() || "—" });
    if (form.tipo !== original.tipo) ms.push({ campo: "tipo", de: original.tipo, para: form.tipo });
    if (nomeDe("cargos", form.cargoId) !== original.cargo) ms.push({ campo: "cargo", de: original.cargo || "—", para: nomeDe("cargos", form.cargoId) || "—" });
    if (nomeDe("setores", form.setorId) !== original.setor) ms.push({ campo: "setor", de: original.setor || "—", para: nomeDe("setores", form.setorId) || "—" });
    if (nomeDe("locais", form.localId) !== original.local) ms.push({ campo: "local", de: original.local || "—", para: nomeDe("locais", form.localId) || "—" });
    if (nomeDe("regionais", form.regionalId) !== original.regional) ms.push({ campo: "regional", de: original.regional || "—", para: nomeDe("regionais", form.regionalId) || "—" });
    if (nomeDe("situacoes", form.situacaoId) !== original.situacao) ms.push({ campo: "situacao", de: original.situacao || "—", para: nomeDe("situacoes", form.situacaoId) || "—" });
    if ((form.liderMatricula || "") !== original.liderMatricula)
      ms.push({ campo: "lider", de: original.liderNome || "Sem líder", para: form.liderNome || "Sem líder" });
    if ((form.nivelId || "") !== (original.nivelId || ""))
      ms.push({
        campo: "nivel",
        de: rotuloNivel(nivelPorId(original.nivelId)) || "Sem nível",
        para: rotuloNivel(nivelPorId(form.nivelId)) || "Sem nível",
      });
    // datas: editáveis só para PJ (CLT vem do DP) — só entram no diff quando PJ
    if (form.tipo === "PJ") {
      if ((form.dataNascimento || "") !== (original.dataNascimento || ""))
        ms.push({ campo: "dataNascimento", de: dataBR(original.dataNascimento), para: dataBR(form.dataNascimento) });
      if ((form.dataAdmissao || "") !== (original.dataAdmissao || ""))
        ms.push({ campo: "dataAdmissao", de: dataBR(original.dataAdmissao), para: dataBR(form.dataAdmissao) });
    }
    return ms;
  }, [form, original, nomeDe, nivelPorId]);

  function set(campo, valor) { setForm((f) => ({ ...f, [campo]: valor })); setSalvo(false); }

  // ===== obrigatoriedade (mesma régua da API, @/lib/validacao) =====
  // Só valida o que ESTA tela edita: CPF e, para CLT, as datas vêm do DP e são
  // somente visualização — não faz sentido travar o save por legado que a tela
  // nem altera. Faltou algo obrigatório → bloqueia; o resto vira pendência.
  const validacao = useMemo(() => {
    if (!form) return null;
    return validarColaborador({
      ...form,
      cpf: "",
      dataNascimento: form.tipo === "PJ" ? form.dataNascimento : "",
      dataAdmissao: form.tipo === "PJ" ? form.dataAdmissao : "",
    }, { novo: false });
  }, [form]);

  const problema = useCallback((campo) => {
    if (!validacao) return "";
    // campo obrigatório esvaziado: avisa na hora (o usuário acabou de apagar)
    if (validacao.faltantes.includes(campo)) return "obrigatório";
    return tentou ? (validacao.erros[campo] || "") : "";
  }, [validacao, tentou]);

  const rot = (texto, campo, extra = null) => (
    <span>
      {texto}
      {OBRIGATORIOS_EDICAO.includes(campo) && <em className="fld-obrig" title="Campo obrigatório"> *</em>}
      {extra}
      {problema(campo) && <em className="fld-erro"> · {problema(campo)}</em>}
    </span>
  );
  const classe = (campo) => (problema(campo) ? "input-invalido" : "");

  // pendências: cadastro incompleto, mas não impedem salvar (vieram assim do DP)
  const pendencias = useMemo(() => {
    if (!form) return [];
    const valor = { cpf: form.cpf, regionalId: form.regionalId, liderMatricula: form.liderMatricula, dataAdmissao: form.dataAdmissao };
    return PENDENCIAS_EDICAO.filter((c) => String(valor[c] ?? "").trim() === "");
  }, [form]);

  function escolherLider(res) {
    setForm((f) => ({ ...f, liderMatricula: res ? res.matricula : "", liderNome: res ? res.nome : "" }));
    setLiderPicker(false); setLiderBusca(""); setSalvo(false);
  }

  async function salvar() {
    // trava de segurança: a API aplica a mesma régua e recusaria o payload
    if (validacao && !validacao.ok) {
      setErro(mensagemValidacao(validacao)); setConfirmando(false); return;
    }
    setSalvando(true); setErro("");
    try {
      // CPF nunca é enviado (só visualização). Datas só vão no payload para
      // PJ — para CLT elas vêm do DP e a API preserva o que não recebe.
      const { cpf: _cpf, dataNascimento, dataAdmissao, ...campos } = form;
      if (form.tipo === "PJ") { campos.dataNascimento = dataNascimento; campos.dataAdmissao = dataAdmissao; }
      const r = await fetch("/api/colaboradores/gestao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selId, campos }),
      });
      const txt = await r.text();
      let j; try { j = JSON.parse(txt); } catch { j = { ok: false, erro: `Servidor respondeu ${r.status}.` }; }
      if (!j.ok) { setErro(j.erro || "Falha ao salvar."); setSalvando(false); setConfirmando(false); return; }
      const c = j.colaborador;
      // atualiza snapshot e lista sem recarregar tudo
      setOriginal({
        nome: c.nome || "", email: c.email || "", tipo: c.tipo_contratacao || "CLT",
        cargo: c.cargo || "", setor: c.setor || "", local: c.local || "",
        regional: c.regional || "", situacao: c.situacao || "",
        liderMatricula: c.lider_mat || "", liderNome: c.lider_nome || "",
        nivelId: c.nivel_pessoal_id || c.cargo_nivel_id || "",
        dataNascimento: c.data_nascimento || "", dataAdmissao: c.data_admissao || "",
      });
      // reflete no formulário as datas efetivamente gravadas
      setForm((f) => f ? { ...f, dataNascimento: c.data_nascimento || "", dataAdmissao: c.data_admissao || "" } : f);
      setResultados((rs) => rs.map((x) => (x.id === selId ? { ...x, nome: c.nome, cargo: c.cargo, setor: c.setor } : x)));
      setConfirmando(false); setSalvo(true);
    } catch (e) { setErro(`Falha ao salvar: ${e.message}`); }
    setSalvando(false);
  }

  // POST na API de gestão com resposta tolerante a erro não-JSON
  async function post(payload) {
    try {
      const r = await fetch("/api/colaboradores/gestao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const txt = await r.text();
      try { return JSON.parse(txt); } catch { return { ok: false, erro: `Servidor respondeu ${r.status}.` }; }
    } catch (e) {
      return { ok: false, erro: `Falha de rede: ${e.message}` };
    }
  }

  async function desativar() {
    setProcessandoAtivo(true); setErro("");
    const j = await post({ acao: "desativar", id: selId });
    setProcessandoAtivo(false);
    if (!j.ok) { setErro(j.erro || "Falha ao desativar."); setConfirmandoDesativar(false); return; }
    setForm((f) => f ? { ...f, ativo: 0, subordinados: 0, liderMatricula: "", liderNome: "" } : f);
    setResultados((rs) => rs.map((x) => (x.id === selId ? { ...x, ativo: 0 } : x)));
    setConfirmandoDesativar(false);
    setSalvo(false);
    setErro("");
    setMsgAtivo(`Colaborador desativado.${j.reapontados ? ` ${j.reapontados} subordinado(s) passaram a responder ao líder acima.` : ""}`);
  }

  async function reativar() {
    setProcessandoAtivo(true); setErro("");
    const j = await post({ acao: "reativar", id: selId });
    setProcessandoAtivo(false);
    if (!j.ok) { setErro(j.erro || "Falha ao reativar."); return; }
    setForm((f) => f ? { ...f, ativo: 1 } : f);
    setResultados((rs) => rs.map((x) => (x.id === selId ? { ...x, ativo: 1 } : x)));
    setMsgAtivo("Colaborador reativado. Ele entra sem líder — defina o líder direto se necessário.");
  }

  return (
    <div className="sol-shell">
      <HeroNav
        titulo="Editar colaboradores"
        subtitulo="Localize por área e nome · edite os dados direto no banco"
        atual="colaboradores"
      />

      <div className="sol-board">
        {/* LISTA / BUSCA */}
        <aside className="sol-lista-wrap">
          <div className="col-filtros">
            <label className="col-fld">
              <span>Área / Setor</span>
              <select value={areaFiltro} onChange={(e) => setAreaFiltro(e.target.value)} disabled={carregandoBoot}>
                <option value="">Todas as áreas</option>
                {areasOrdenadas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </label>
            <div className="sol-busca">
              <SearchIcon size={14} />
              <input placeholder="Buscar por nome..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <label className="col-inativos">
              <input type="checkbox" checked={incluirInativos} onChange={(e) => setIncluirInativos(e.target.checked)} />
              Mostrar desativados
            </label>
          </div>

          <div className="sol-lista">
            {bootErro && <div className="sol-info erro"><AlertIcon size={18} /><span>{bootErro}</span></div>}
            {!bootErro && buscando && <div className="sol-info">Buscando...</div>}
            {!bootErro && !buscando && !areaFiltro && busca.trim().length < 2 && (
              <div className="sol-info">Escolha uma área ou digite ao menos 2 letras do nome para localizar.</div>
            )}
            {!bootErro && !buscando && buscaFeita && resultados.length === 0 && (
              <div className="sol-info">Nenhum colaborador encontrado com esses filtros.</div>
            )}
            {resultados.map((c) => (
              <button key={c.id} className={`sol-card ${selId === c.id ? "sel" : ""} ${c.ativo === 0 ? "inativo" : ""}`} onClick={() => selecionar(c.id)}>
                <span className="sc-ava"><UserIcon size={18} /></span>
                <span className="sc-txt">
                  <b>{c.nome}{c.ativo === 0 && <span className="col-tag-off">desativado</span>}</b>
                  <em>{c.cargo || "Cargo a definir"}</em>
                  <small>{c.matricula} · {c.setor || "sem área"}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* DETALHE / EDIÇÃO */}
        <section className="sol-detalhe">
          {!selId && <div className="sol-info grande">Selecione um colaborador à esquerda para editar.</div>}
          {selId && carregandoDet && <div className="sol-info grande">Carregando dados...</div>}

          {selId && !carregandoDet && form && (
            <>
              <div className="sol-det-head">
                <div className="ava lg"><UserIcon size={28} /></div>
                <div>
                  <h2>{original?.nome || form.nome}</h2>
                  <p>Matrícula {form.matricula || "—"}</p>
                </div>
                {form.ativo === 0
                  ? <span className="col-edit-tag off">Desativado</span>
                  : <span className="col-edit-tag"><PencilIcon size={13} /> Edição direta</span>}
              </div>

              {form.ativo === 0 && (
                <div className="modal-note col-arquivado">
                  <b>Este colaborador está desativado (arquivado) — os dados abaixo são somente visualização.</b>{" "}
                  Ele não aparece no organograma, nas contagens nem na busca padrão. O registro e o histórico
                  foram preservados — use <b>Reativar</b> para trazê-lo de volta e poder editar.
                </div>
              )}

              {erro && <div className="modal-alert"><AlertIcon size={16} /><div><b>{erro}</b></div></div>}
              {salvo && <div className="modal-note sol-ok"><b>Alterações salvas no banco.</b></div>}
              {msgAtivo && <div className="modal-note sol-ok"><b>{msgAtivo}</b></div>}

              {/* cadastro incompleto: informa sem impedir o save (esses campos
                  vieram em branco do extrato do DP em parte da base) */}
              {form.ativo !== 0 && pendencias.length > 0 && (
                <div className="modal-note col-pendencias">
                  <b>Cadastro incompleto — falta {listarRotulos(pendencias)}.</b>{" "}
                  Não impede salvar, mas vale completar quando o dado estiver disponível.
                </div>
              )}

              {/* desativado = somente visualização: o fieldset desabilita
                  todos os campos e botões internos (inclusive trocar líder) */}
              <fieldset className="col-form" disabled={form.ativo === 0}>
                <label className="fld">
                  {rot("Nome", "nome")}
                  <input value={form.nome} className={classe("nome")} onChange={(e) => set("nome", e.target.value)} />
                </label>
                <div className="col-grid2">
                  <label className="fld">
                    {rot("E-mail corporativo", "email")}
                    <input value={form.email} className={classe("email")} placeholder="nome@meuinc.com.br" onChange={(e) => set("email", e.target.value)} />
                  </label>
                  <label className="fld">
                    <span>CPF <em className="ct-ex">· somente visualização</em></span>
                    <input
                      value={form.cpf}
                      placeholder="Não informado"
                      disabled
                      title="O CPF vem da importação por Excel (ou do cadastro PJ) e não é editável aqui."
                    />
                  </label>
                </div>
                <div className="col-grid2">
                  <label className="fld">
                    <span>Data de nascimento{form.tipo === "CLT" ? <em className="ct-ex"> · vem do DP</em> : null}</span>
                    <input
                      type="date"
                      value={form.dataNascimento}
                      disabled={form.tipo === "CLT"}
                      title={form.tipo === "CLT" ? "Vem da importação por Excel (DP) e não é editável para CLT." : ""}
                      onChange={(e) => set("dataNascimento", e.target.value)}
                    />
                  </label>
                  <label className="fld">
                    <span>Data de admissão{form.tipo === "CLT" ? <em className="ct-ex"> · vem do DP</em> : null}</span>
                    <input
                      type="date"
                      value={form.dataAdmissao}
                      disabled={form.tipo === "CLT"}
                      title={form.tipo === "CLT" ? "Vem da importação por Excel (DP) e não é editável para CLT." : ""}
                      onChange={(e) => set("dataAdmissao", e.target.value)}
                    />
                  </label>
                </div>
                <div className="col-grid2">
                  <label className="fld">
                    <span>Tipo de contratação</span>
                    <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
                      <option value="CLT">CLT</option>
                      <option value="PJ">PJ</option>
                    </select>
                  </label>
                  <label className="fld">
                    {rot("Situação", "situacaoId")}
                    <select value={form.situacaoId} className={classe("situacaoId")} onChange={(e) => set("situacaoId", e.target.value)}>
                      <option value="">— selecione —</option>
                      {(listas?.situacoes || []).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select>
                  </label>
                </div>
                <label className="fld">
                  {rot("Cargo", "cargoId")}
                  <select value={form.cargoId} className={classe("cargoId")} onChange={(e) => trocaCargo(e.target.value)}>
                    <option value="">— selecione —</option>
                    {(listas?.cargos || []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </label>

                {/* variação da família: o CÓDIGO do nível vem do cargo (edita-se
                    no catálogo); aqui só a variação dentro desse nível */}
                {(() => {
                  const padrao = nivelDoCargo(form.cargoId);
                  const variacoes = padrao ? variacoesDe(padrao.ordem) : [];
                  return (
                    <>
                      <label className="fld">
                        <span>
                          Variação da família
                          {padrao ? <em className="ct-ex"> · nível {padrao.ordem} (definido pelo cargo)</em> : null}
                        </span>
                        <select
                          value={form.nivelId}
                          disabled={!form.cargoId || !padrao}
                          title={!form.cargoId
                            ? "Selecione um cargo primeiro"
                            : !padrao ? "Este cargo ainda não tem nível — defina em Gerenciar → Catálogos → Cargos" : ""}
                          onChange={(e) => set("nivelId", e.target.value)}
                        >
                          <option value="">— selecione —</option>
                          {variacoes.map((n) => (
                            <option key={n.id} value={n.id}>{rotuloNivel(n)}</option>
                          ))}
                        </select>
                      </label>
                      {form.cargoId && (
                        <p className="col-nivel-nota">
                          {padrao ? (
                            <>A variação vale <b>somente para este colaborador</b> — o padrão do cargo é <b>{rotuloNivel(padrao)}</b>.
                            O número do nível é do cargo e se edita em Gerenciar → Catálogos → Cargos (vale para todos).</>
                          ) : (
                            <>Este cargo ainda não tem nível hierárquico vinculado — defina primeiro em
                            Gerenciar → Catálogos → Cargos para liberar as variações.</>
                          )}
                        </p>
                      )}
                    </>
                  );
                })()}
                <div className="col-grid2">
                  <label className="fld">
                    {rot("Área / Setor", "setorId")}
                    <select value={form.setorId} className={classe("setorId")} onChange={(e) => set("setorId", e.target.value)}>
                      <option value="">— selecione —</option>
                      {(listas?.setores || []).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select>
                  </label>
                  <label className="fld">
                    <span>Regional</span>
                    <select value={form.regionalId} onChange={(e) => set("regionalId", e.target.value)}>
                      <option value="">— selecione —</option>
                      {(listas?.regionais || []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
                    </select>
                  </label>
                </div>
                <label className="fld">
                  {rot("Local de trabalho", "localId")}
                  <select value={form.localId} className={classe("localId")} onChange={(e) => set("localId", e.target.value)}>
                    <option value="">— selecione —</option>
                    {(listas?.locais || []).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
                </label>

                {/* líder direto: card + troca via busca em todas as áreas */}
                <div className="fld fld-lider" ref={liderRef}>
                  <span>Líder direto</span>
                  <div className="lider-atual">
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
                        <input autoFocus placeholder="Buscar pelo nome do líder (todas as áreas)..." value={liderBusca} onChange={(e) => setLiderBusca(e.target.value)} />
                      </div>
                      <div className="lp-hint">Busca em todas as áreas — o líder pode ser de outro setor.</div>
                      <div className="lider-list">
                        <button type="button" className={`ll-item ${form.liderMatricula === "" ? "sel" : ""}`} onClick={() => escolherLider(null)}>
                          <b>— Sem líder (topo)</b>
                        </button>
                        {liderResultados.map((l) => (
                          <button type="button" key={l.matricula} className={`ll-item ${form.liderMatricula === l.matricula ? "sel" : ""}`} onClick={() => escolherLider(l)}>
                            <b>{l.nome}</b><em>{(l.cargo || "Cargo a definir")}{l.setor ? ` · ${l.setor}` : ""}</em>
                          </button>
                        ))}
                        {liderBuscando && <div className="ll-vazio">Buscando...</div>}
                        {!liderBuscando && liderResultados.length === 0 && (
                          <div className="ll-vazio">{liderBusca ? `Nenhuma pessoa encontrada para "${liderBusca}"` : "Digite para buscar"}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </fieldset>

              {confirmando && (
                <div className="sol-confirma">
                  <b className="sol-titulo">Confirmar alterações</b>
                  {mudancas.length === 0 ? (
                    <p className="sol-texto">Nenhuma alteração para salvar.</p>
                  ) : (
                    <ul className="sol-diffs">
                      {mudancas.map((m) => (
                        <li key={m.campo}>
                          <span className="sol-campo">{CAMPOS_LABEL[m.campo] || m.campo}</span>
                          <span className="sol-de">{m.de}</span>
                          <span className="sol-seta">→</span>
                          <span className="sol-para">{m.para}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* zona de ativação: desativar (arquivar) ou reativar */}
              {!confirmando && (
                <div className="col-perigo">
                  {form.ativo === 0 ? (
                    <div className="cp-linha">
                      <div className="cp-txt">
                        <b>Reativar colaborador</b>
                        <em>Volta a aparecer no organograma e na busca. Entra sem líder — defina depois se precisar.</em>
                      </div>
                      <button className="btn btn-neutral" disabled={processandoAtivo} onClick={reativar}>
                        {processandoAtivo ? "Reativando..." : "Reativar"}
                      </button>
                    </div>
                  ) : confirmandoDesativar ? (
                    <div className="cp-confirma">
                      <b className="cp-tit"><AlertIcon size={14} /> Desativar {original?.nome || form.nome}?</b>
                      <p className="sol-texto">
                        O colaborador é <b>arquivado</b> (sai do organograma, das contagens e da busca), mas o
                        registro e o histórico são preservados — dá para reativar depois.
                        {form.subordinados > 0 && (
                          <> Os <b>{form.subordinados}</b> subordinado(s) diretos passam a responder ao
                          líder acima ({form.liderNome || "sem líder / viram topo da área"}).</>
                        )}
                      </p>
                      <div className="cp-acoes">
                        <button className="btn btn-neutral btn-sm" onClick={() => setConfirmandoDesativar(false)}>Cancelar</button>
                        <button className="btn btn-ghost btn-sm" disabled={processandoAtivo} onClick={desativar}>
                          {processandoAtivo ? "Desativando..." : "Confirmar desativação"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="cp-linha">
                      <div className="cp-txt">
                        <b>Desativar colaborador</b>
                        <em>Para quem saiu da empresa. Arquiva sem apagar — reversível.</em>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setErro(""); setMsgAtivo(""); setConfirmandoDesativar(true); }}>
                        Desativar
                      </button>
                    </div>
                  )}
                </div>
              )}

              {form.ativo !== 0 && (
              <div className="col-foot">
                {confirmando ? (
                  <>
                    <button className="btn btn-neutral" onClick={() => setConfirmando(false)}>Voltar</button>
                    <div style={{ flex: 1 }} />
                    <button className="btn btn-primary" disabled={salvando || mudancas.length === 0 || !validacao?.ok} onClick={salvar}>
                      <span className="ic"><CheckIcon /></span>{salvando ? "Salvando..." : "Confirmar e salvar"}
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1 }} />
                    <button
                      className="btn btn-primary"
                      disabled={mudancas.length === 0}
                      title={mudancas.length === 0 ? "Nenhuma alteração feita" : ""}
                      onClick={() => {
                        setErro(""); setTentou(true);
                        // mostra o que falta em vez de abrir a confirmação
                        if (!validacao?.ok) { setErro(mensagemValidacao(validacao)); return; }
                        setConfirmando(true);
                      }}
                    >
                      <span className="ic"><CheckIcon /></span>Salvar alterações{mudancas.length ? ` (${mudancas.length})` : ""}
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
