// Exportação da base completa de colaboradores em .xlsx, no MESMO formato
// (18 colunas) da planilha de importação — para o arquivo poder ser reeditado
// e re-subido pelo "Importar Excel". Gera o arquivo no servidor e o entrega
// como download (colaboradores_exportados.xlsx).
//   GET [?todos=1] → só ativos por padrão; todos=1 inclui arquivados

import * as XLSX from "xlsx";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

// ordem EXATA das colunas do modelo de importação (lib/importacao.js casa por
// conteúdo, mas manter a mesma ordem deixa o arquivo idêntico ao modelo)
const CABECALHO = [
  "Cod. Colaborador sistema do Departamento Pessoal",
  "Regional",
  "Nome Colaborador",
  "Tipo Contratação",
  "Cargo",
  "Setor",
  "Codigo Setor",
  "Cod. Cargo",
  "Cod. Nivel Hierar. Cargo",
  "Variação Nivel Cargo",
  "Familia Nível Cargo",
  "Cod. Nivel Hierarquia",
  "Matricula Lider",
  "Nome Lider",
  "Situação Colaborador",
  "Codigo Situação Colaborador",
  "Local de Trabalho",
  "Cod. Local Trabalho",
];

export async function GET(req) {
  try {
    const pool = getPool();
    const incluirTodos = new URL(req.url).searchParams.get("todos") === "1";
    const filtroAtivo = incluirTodos ? "" : "WHERE c.ativo = 1";

    const [rows] = await pool.query(
      `SELECT c.codigo_dp, c.nome, c.tipo_contratacao,
              reg.nome AS regional,
              cg.nome AS cargo, cg.codigo_cargo_dp,
              COALESCE(nhp.ordem, nh.ordem) AS nh_ordem,
              COALESCE(nhp.cod_var, nh.cod_var) AS nh_var,
              COALESCE(nhp.familia, nh.familia) AS nh_familia,
              COALESCE(nhp.codigo_nh, nh.codigo_nh) AS codigo_nh,
              s.nome AS setor, s.codigo_dp AS setor_cod,
              lt.nome AS local, lt.codigo_dp AS local_cod,
              sit.nome AS situacao, sit.codigo_dp AS sit_cod,
              ld.codigo_dp AS lider_mat, ld.nome AS lider_nome
         FROM colaborador c
         LEFT JOIN regional reg          ON reg.id = c.regional_id
         LEFT JOIN cargo cg              ON cg.id = c.cargo_id
         LEFT JOIN nivel_hierarquico nh  ON nh.id = cg.nivel_id
         LEFT JOIN nivel_hierarquico nhp ON nhp.id = c.nivel_id
         LEFT JOIN setor s               ON s.id = c.setor_id
         LEFT JOIN local_trabalho lt     ON lt.id = c.local_id
         LEFT JOIN situacao sit          ON sit.id = c.situacao_id
         LEFT JOIN colaborador ld        ON ld.id = c.lider_id
         ${filtroAtivo}
        ORDER BY s.nome, c.nome`
    );

    const matriz = [CABECALHO];
    for (const r of rows) {
      matriz.push([
        r.codigo_dp || "",
        r.regional || "",
        r.nome || "",
        r.tipo_contratacao || "",
        r.cargo || "",
        r.setor || "",
        r.setor_cod || "",
        r.codigo_cargo_dp || "",
        r.nh_ordem != null ? String(r.nh_ordem) : "",
        r.nh_var || "",
        r.nh_familia || "",
        r.codigo_nh || "",
        r.lider_mat || "",
        r.lider_nome || "",
        r.situacao || "",
        r.sit_cod || "",
        r.local || "",
        r.local_cod || "",
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(matriz);
    // larguras confortáveis para leitura
    ws["!cols"] = CABECALHO.map((h) => ({ wch: Math.min(38, Math.max(12, h.length)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Colaboradores");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="colaboradores_exportados.xlsx"',
        "Content-Length": String(buf.length),
      },
    });
  } catch (e) {
    const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
    return Response.json({ ok: false, erro: msg }, { status: 500 });
  }
}
