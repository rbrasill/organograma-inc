// Edição direta a partir do card do organograma (PersonModal): grava só os
// campos "aplica na hora" — nome, e-mail e local de trabalho. NÃO toca em
// dados estruturais (cargo, área, líder), que seguem por "Solicitar ajuste".
// Chave pela matrícula (codigo_dp) do card; local vem por NOME (dropdown) e
// é resolvido para o id aqui.
//   POST { matricula, nome, email, local }

import { getPool } from "@/lib/db";
import { normalizar } from "@/data/ti";
import { exigirNivel } from "@/lib/permissoes";
import { NIVEL } from "@/lib/perfis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req) {
  const bloqueio = exigirNivel(NIVEL.ADMIN);
  if (bloqueio) return bloqueio;
  try {
    const pool = getPool();
    const body = await req.json().catch(() => ({}));

    const matricula = (body.matricula || "").trim();
    if (!matricula) return Response.json({ ok: false, erro: "Colaborador não informado." }, { status: 400 });

    const nome = (body.nome || "").trim();
    if (!nome) return Response.json({ ok: false, erro: "O nome não pode ficar em branco." }, { status: 400 });

    const email = (body.email || "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ ok: false, erro: "E-mail em formato inválido." }, { status: 400 });
    }

    // resolve o colaborador pela matrícula (ou pelo UUID, caso não tenha matrícula)
    const [[c]] = await pool.query(
      "SELECT id, ativo FROM colaborador WHERE codigo_dp = ? OR id = ? LIMIT 1",
      [matricula, matricula]
    );
    if (!c) return Response.json({ ok: false, erro: "Colaborador não encontrado." }, { status: 404 });
    if (!c.ativo) {
      return Response.json({ ok: false, erro: "Colaborador desativado — reative-o para editar." }, { status: 409 });
    }

    // local por nome (opção do dropdown) → id; vazio = remove o vínculo
    let localId = null;
    const localNome = (body.local || "").trim();
    if (localNome) {
      const [[l]] = await pool.query(
        "SELECT id FROM local_trabalho WHERE nome = ? OR nome_normalizado = ? LIMIT 1",
        [localNome, normalizar(localNome)]
      );
      if (!l) return Response.json({ ok: false, erro: `Local "${localNome}" não encontrado.` }, { status: 400 });
      localId = l.id;
    }

    await pool.query(
      "UPDATE colaborador SET nome = ?, email = ?, local_id = ? WHERE id = ?",
      [nome, email || null, localId, c.id]
    );
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao salvar: ${e.message}`;
    return Response.json({ ok: false, erro: msg }, { status: 500 });
  }
}
