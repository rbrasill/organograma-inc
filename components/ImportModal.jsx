"use client";

// Importação por Excel (funcionalidade temporária até as integrações):
// upload → prévia somente visualização (validações + resumo) → confirmar
// → upsert no banco (inserir/atualizar/arquivar). Regras: CLAUDE.md seção 7.

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { extrairLinhas, validarLinhas } from "@/lib/importacao";
import { CloseIcon, AlertIcon, CheckIcon, UploadIcon, DownloadIcon } from "@/components/icons";

const ROTULO_STATUS = { ok: "OK", alerta: "Alerta", erro: "Erro" };

export default function ImportModal({ onClose }) {
  const [etapa, setEtapa] = useState("selecao"); // selecao | lendo | previa | enviando | resultado
  const [arquivoNome, setArquivoNome] = useState("");
  const [previa, setPrevia] = useState(null);      // { anotadas, resumo, arquivar, avisoBanco }
  const [resultado, setResultado] = useState(null);
  const [erroGeral, setErroGeral] = useState("");
  const [soProblemas, setSoProblemas] = useState(false);
  const inputRef = useRef(null);

  async function processarArquivo(file) {
    if (!file) return;
    setErroGeral("");
    setEtapa("lendo");
    setArquivoNome(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const matriz = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
      const { erro, linhas } = extrairLinhas(matriz);
      if (erro) { setErroGeral(erro); setEtapa("selecao"); return; }

      // dados do banco para a prévia (novos x atualizados x arquivados)
      let matriculasBanco = new Set();
      let situacoesValidas = null;
      let avisoBanco = "";
      try {
        const r = await fetch("/api/importacao");
        const j = await r.json();
        if (j.ok) {
          matriculasBanco = new Set(j.matriculas);
          situacoesValidas = new Set(j.situacoes.map((s) => s.normalizado));
        } else {
          avisoBanco = j.erro || "Banco indisponível — prévia sem comparação com a base atual.";
        }
      } catch {
        avisoBanco = "Banco indisponível — prévia sem comparação com a base atual.";
      }

      const { anotadas, resumo } = validarLinhas(linhas, { matriculasBanco, situacoesValidas });
      const noArquivo = new Set(anotadas.filter((l) => l.status !== "erro").map((l) => l.matricula));
      const arquivar = [...matriculasBanco].filter((m) => !noArquivo.has(m));
      setPrevia({ anotadas, resumo, arquivar, avisoBanco });
      setEtapa("previa");
    } catch (e) {
      setErroGeral(`Não consegui ler o arquivo: ${e.message}`);
      setEtapa("selecao");
    }
  }

  async function confirmar() {
    setEtapa("enviando");
    setErroGeral("");
    try {
      const linhas = previa.anotadas.map(({ linha, matricula, nome, cargo, codigoCargo, setor, local, regional, situacao, matriculaLider }) =>
        ({ linha, matricula, nome, cargo, codigoCargo, setor, local, regional, situacao, matriculaLider }));
      const r = await fetch("/api/importacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arquivoNome, linhas }),
      });
      const j = await r.json();
      if (!j.ok) { setErroGeral(j.erro || "Falha na importação."); setEtapa("previa"); return; }
      setResultado(j.resultado);
      setEtapa("resultado");
    } catch (e) {
      setErroGeral(`Falha ao enviar: ${e.message}`);
      setEtapa("previa");
    }
  }

  const linhasVisiveis = previa
    ? (soProblemas ? previa.anotadas.filter((l) => l.status !== "ok") : previa.anotadas)
    : [];

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal imp-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label="Fechar"><CloseIcon size={16} /></button>

        <div className="modal-head">
          <div className="imp-ico"><UploadIcon size={22} /></div>
          <div>
            <h3>Importar base por Excel</h3>
            <p>Upsert por matrícula · quem sair do arquivo é arquivado · nada é apagado</p>
          </div>
        </div>

        <div className="modal-body">
          {erroGeral && (
            <div className="modal-alert"><AlertIcon size={16} /><div><b>{erroGeral}</b></div></div>
          )}

          {(etapa === "selecao" || etapa === "lendo") && (
            <>
            <div
              className={`imp-drop ${etapa === "lendo" ? "lendo" : ""}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); processarArquivo(e.dataTransfer.files?.[0]); }}
            >
              <UploadIcon size={30} />
              {etapa === "lendo"
                ? <b>Lendo {arquivoNome}...</b>
                : <><b>Arraste o arquivo .xlsx aqui</b><em>ou clique para escolher — formato: Organograma Institucional</em></>}
              <input
                ref={inputRef} type="file" hidden
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => processarArquivo(e.target.files?.[0])}
              />
            </div>
            {etapa === "selecao" && (
              <a
                className="imp-modelo"
                href="/modelo-importacao-organograma.xlsx"
                download
                onClick={(e) => e.stopPropagation()}
              >
                <DownloadIcon size={14} /> Baixar modelo de exemplo (.xlsx)
              </a>
            )}
            </>
          )}

          {(etapa === "previa" || etapa === "enviando") && previa && (
            <>
              {previa.avisoBanco && (
                <div className="modal-alert"><AlertIcon size={16} /><div><b>{previa.avisoBanco}</b></div></div>
              )}
              <div className="imp-resumo">
                <span className="imp-chip"><b>{previa.resumo.total}</b> linhas</span>
                <span className="imp-chip novo"><b>{previa.resumo.novos}</b> novos</span>
                <span className="imp-chip atual"><b>{previa.resumo.atualizados}</b> atualizações</span>
                <span className="imp-chip arq"><b>{previa.arquivar.length}</b> a arquivar</span>
                <span className="imp-chip alerta"><b>{previa.resumo.alertas}</b> alertas</span>
                <span className="imp-chip erro"><b>{previa.resumo.erros}</b> erros (serão pulados)</span>
              </div>

              <label className="imp-filtro">
                <input type="checkbox" checked={soProblemas} onChange={(e) => setSoProblemas(e.target.checked)} />
                Mostrar apenas linhas com alerta ou erro
              </label>

              <div className="imp-tabela-wrap">
                <table className="imp-tabela">
                  <thead>
                    <tr>
                      <th>Linha</th><th>Matrícula</th><th>Nome</th><th>Cargo</th>
                      <th>Setor</th><th>Líder</th><th>Situação</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasVisiveis.map((l) => (
                      <tr key={l.linha} className={`st-${l.status}`}>
                        <td>{l.linha}</td>
                        <td>{l.matricula || "—"}</td>
                        <td className="td-nome" title={l.nome}>{l.nome || "—"}</td>
                        <td title={l.cargo}>{l.cargo || "—"}</td>
                        <td title={l.setor}>{l.setor || "—"}</td>
                        <td>{l.matriculaLider || "—"}</td>
                        <td>{l.situacao || "—"}</td>
                        <td>
                          <span className={`imp-badge ${l.status}`}
                            title={[...l.erros, ...l.alertas].join(" · ") || "Sem pendências"}>
                            {ROTULO_STATUS[l.status]}{l.existente ? "" : " · novo"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {previa.arquivar.length > 0 && (
                <div className="imp-arquivar">
                  <b>Serão arquivados (não vieram no arquivo):</b> {previa.arquivar.join(", ")}
                </div>
              )}
            </>
          )}

          {etapa === "resultado" && resultado && (
            <div className="imp-final">
              <div className="imp-final-ico"><CheckIcon size={26} /></div>
              <h4>Importação concluída</h4>
              <div className="imp-resumo">
                <span className="imp-chip novo"><b>{resultado.inseridos}</b> inseridos</span>
                <span className="imp-chip atual"><b>{resultado.atualizados}</b> atualizados</span>
                <span className="imp-chip arq"><b>{resultado.arquivados}</b> arquivados</span>
                <span className="imp-chip erro"><b>{resultado.pulados}</b> pulados (erro)</span>
              </div>
              <p className="imp-nota">O relatório completo ficou registrado no banco (importacao / importacao_item).</p>
            </div>
          )}
        </div>

        <div className="modal-foot">
          {etapa === "previa" && (
            <button className="btn btn-neutral" onClick={() => { setPrevia(null); setEtapa("selecao"); }}>
              Trocar arquivo
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-neutral" onClick={onClose}>
            {etapa === "resultado" ? "Fechar" : "Cancelar"}
          </button>
          {(etapa === "previa" || etapa === "enviando") && (
            <button
              className="btn btn-primary"
              disabled={etapa === "enviando" || !!previa?.avisoBanco}
              title={previa?.avisoBanco ? "Configure o banco (.env) para habilitar a gravação" : ""}
              onClick={confirmar}
            >
              <span className="ic"><CheckIcon /></span>
              {etapa === "enviando" ? "Gravando no banco..." : "Confirmar e gravar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
