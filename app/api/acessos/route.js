// Gerenciamento de usuários e perfis de acesso (página /acessos, só ADMIN).
// Regra do produto: TODO usuário nasce no perfil PADRÃO (sem linha em
// usuario_perfil) e NÃO aparece aqui — só aparece quem foi promovido a
// COLABORADOR, GESTOR ou ADMIN. Remover o perfil devolve a pessoa ao padrão.
//
//   GET            → { promovidos } (lista de quem tem perfil definido)
//   GET ?q=<termo> → { resultados } (busca colaborador ativo p/ promover)
//   POST { acao:"definir", colaboradorId, perfil } → cria/troca o perfil
//   POST { acao:"remover", colaboradorId }         → volta ao padrão
//
// Proteção anti-lock-out: o sistema nunca fica sem ADMIN — rebaixar/remover
// o ÚLTIMO admin é bloqueado (além dele, a env ACESSO_ADMIN_CPFS garante
// admins de emergência no login).
// Mudança de perfil vale a partir do PRÓXIMO login (o perfil é claim da sessão).

import { randomUUID } from "crypto";
import { getPool } from "@/lib/db";
import { exigirNivel } from "@/lib/permissoes";
import { NIVEL, PERFIS_PROMOVIDOS } from "@/lib/perfis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function erroResposta(e) {
  const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
  return Response.json({ ok: false, erro: msg }, { status: 500 });
}
const erro400 = (m) => Response.json({ ok: false, erro: m }, { status: 400 });

export async function GET(req) {
  const bloqueio = exigirNivel(NIVEL.ADMIN);
  if (bloqueio) return bloqueio;
  try {
    const pool = getPool();
    const q = (new URL(req.url).searchParams.get("q") || "").trim();

    // busca de colaboradores ativos para promover (traz o perfil atual, se houver)
    if (q) {
      const [rows] = await pool.query(
        `SELECT c.id, c.codigo_dp AS matricula, c.nome, cg.nome AS cargo, up.perfil
           FROM colaborador c
           LEFT JOIN cargo cg ON cg.id = c.cargo_id
           LEFT JOIN usuario_perfil up ON up.colaborador_id = c.id
          WHERE c.ativo = 1 AND (c.nome LIKE ? OR c.codigo_dp LIKE ?)
          ORDER BY c.nome LIMIT 20`,
        [`%${q}%`, `%${q}%`]
      );
      return Response.json({ ok: true, resultados: rows });
    }

    // lista dos promovidos (quem está no padrão não aparece — regra do produto)
    const [rows] = await pool.query(
      `SELECT up.colaborador_id AS id, up.perfil,
              c.codigo_dp AS matricula, c.nome, c.ativo, cg.nome AS cargo
         FROM usuario_perfil up
         JOIN colaborador c ON c.id = up.colaborador_id
         LEFT JOIN cargo cg ON cg.id = c.cargo_id
        ORDER BY FIELD(up.perfil, 'ADMIN', 'GESTOR', 'COLABORADOR'), c.nome`
    );
    return Response.json({ ok: true, promovidos: rows });
  } catch (e) {
    return erroResposta(e);
  }
}

async function contarAdmins(pool) {
  const [[r]] = await pool.query("SELECT COUNT(*) n FROM usuario_perfil WHERE perfil = 'ADMIN'");
  return Number(r.n);
}

export async function POST(req) {
  const bloqueio = exigirNivel(NIVEL.ADMIN);
  if (bloqueio) return bloqueio;
  try {
    const pool = getPool();
    const body = await req.json().catch(() => ({}));
    const colaboradorId = body.colaboradorId;
    if (!colaboradorId) return erro400("Colaborador não informado.");

    const [[colab]] = await pool.query(
      "SELECT id, nome FROM colaborador WHERE id = ?", [colaboradorId]
    );
    if (!colab) return Response.json({ ok: false, erro: "Colaborador não encontrado." }, { status: 404 });

    const [[atual]] = await pool.query(
      "SELECT perfil FROM usuario_perfil WHERE colaborador_id = ?", [colaboradorId]
    );

    if (body.acao === "definir") {
      const perfil = body.perfil;
      if (!PERFIS_PROMOVIDOS.includes(perfil)) return erro400("Perfil inválido.");
      // rebaixar o último ADMIN deixaria o sistema sem administrador
      if (atual?.perfil === "ADMIN" && perfil !== "ADMIN" && (await contarAdmins(pool)) <= 1) {
        return erro400("Este é o único administrador — promova outro ADMIN antes de rebaixá-lo.");
      }
      await pool.query(
        `INSERT INTO usuario_perfil (id, colaborador_id, perfil) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE perfil = VALUES(perfil)`,
        [randomUUID(), colaboradorId, perfil]
      );
      return Response.json({ ok: true });
    }

    if (body.acao === "remover") {
      if (!atual) return erro400("Este colaborador já está no perfil padrão.");
      if (atual.perfil === "ADMIN" && (await contarAdmins(pool)) <= 1) {
        return erro400("Este é o único administrador — promova outro ADMIN antes de removê-lo.");
      }
      await pool.query("DELETE FROM usuario_perfil WHERE colaborador_id = ?", [colaboradorId]);
      return Response.json({ ok: true });
    }

    return erro400("Ação desconhecida.");
  } catch (e) {
    return erroResposta(e);
  }
}
