// Painel de indicadores do organograma (GET) — GESTOR ou ADMIN.
// Devolve todos os agregados prontos: regional, tipo de contratação,
// diretoria (mesma regra da tela Diretorias — lib/diretorias.js), situação,
// família do nível hierárquico, faixa etária e tempo de empresa.
// As FAIXAS de idade/tempo são configuráveis nas constantes abaixo.

import { getPool } from "@/lib/db";
import { exigirNivel } from "@/lib/permissoes";
import { NIVEL } from "@/lib/perfis";
import { mapaDiretorias } from "@/lib/diretorias";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ===== faixas configuráveis =====
// idade em ANOS: [rótulo, limite superior INCLUSIVO] — a última cobre o resto
const FAIXAS_IDADE = [
  ["Até 20", 20], ["21 a 25", 25], ["26 a 30", 30], ["31 a 35", 35],
  ["36 a 40", 40], ["41 a 45", 45], ["46 a 50", 50], ["51 a 55", 55],
  ["56 a 60", 60], ["60+", Infinity],
];
// tempo de empresa em MESES: [rótulo, limite superior EXCLUSIVO]
const FAIXAS_TEMPO = [
  ["< 6 meses", 6], ["6m a 1 ano", 12], ["1 a 2 anos", 24], ["2 a 3 anos", 36],
  ["3 a 5 anos", 60], ["5 a 7 anos", 84], ["7 a 10 anos", 120],
  ["10 a 15 anos", 180], ["15 a 20 anos", 240], ["20+ anos", Infinity],
];

function distribuir(valores, faixas, inclusivo) {
  const cont = new Map(faixas.map(([rot]) => [rot, 0]));
  let semData = 0;
  for (const v of valores) {
    if (v == null) { semData++; continue; }
    const faixa = faixas.find(([, lim]) => (inclusivo ? v <= lim : v < lim));
    cont.set(faixa[0], cont.get(faixa[0]) + 1);
  }
  const out = faixas.map(([rot]) => ({ rotulo: rot, n: cont.get(rot) }));
  if (semData > 0) out.push({ rotulo: "Sem data", n: semData });
  return out;
}

function erroResposta(e) {
  const msg = e?.codigo === "SEM_CONFIG" ? e.message : `Falha ao acessar o banco: ${e.message}`;
  return Response.json({ ok: false, erro: msg }, { status: 500 });
}

export async function GET() {
  const bloqueio = exigirNivel(NIVEL.GESTOR);
  if (bloqueio) return bloqueio;
  try {
    const pool = getPool();

    const [regional] = await pool.query(
      `SELECT COALESCE(r.nome,'Sem regional') AS rotulo, COUNT(*) AS n
         FROM colaborador c LEFT JOIN regional r ON r.id = c.regional_id
        WHERE c.ativo = 1 GROUP BY rotulo ORDER BY n DESC`
    );
    const [tipo] = await pool.query(
      `SELECT tipo_contratacao AS rotulo, COUNT(*) AS n
         FROM colaborador WHERE ativo = 1 GROUP BY rotulo ORDER BY n DESC`
    );
    const [situacao] = await pool.query(
      `SELECT COALESCE(s.nome,'Sem situação') AS rotulo, COUNT(*) AS n
         FROM colaborador c LEFT JOIN situacao s ON s.id = c.situacao_id
        WHERE c.ativo = 1 GROUP BY rotulo ORDER BY n DESC`
    );
    const [familia] = await pool.query(
      `SELECT COALESCE(COALESCE(nhp.familia, nh.familia),'Sem família') AS rotulo, COUNT(*) AS n
         FROM colaborador c
         LEFT JOIN cargo cg ON cg.id = c.cargo_id
         LEFT JOIN nivel_hierarquico nh ON nh.id = cg.nivel_id
         LEFT JOIN nivel_hierarquico nhp ON nhp.id = c.nivel_id
        WHERE c.ativo = 1 GROUP BY rotulo ORDER BY n DESC`
    );
    // idades/tempos crus — as faixas são aplicadas aqui no servidor, pelas
    // constantes configuráveis lá em cima
    const [idades] = await pool.query(
      `SELECT TIMESTAMPDIFF(YEAR, data_nascimento, CURDATE()) AS v
         FROM colaborador WHERE ativo = 1`
    );
    const [tempos] = await pool.query(
      `SELECT TIMESTAMPDIFF(MONTH, data_admissao, CURDATE()) AS v
         FROM colaborador WHERE ativo = 1`
    );

    const { lista: diretoria, totalAtivos } = await mapaDiretorias(pool);

    return Response.json({
      ok: true,
      total: totalAtivos,
      regional,
      tipo,
      situacao,
      diretoria,
      familia,
      idade: distribuir(idades.map((r) => r.v), FAIXAS_IDADE, true),
      tempo: distribuir(tempos.map((r) => r.v), FAIXAS_TEMPO, false),
    });
  } catch (e) {
    return erroResposta(e);
  }
}
