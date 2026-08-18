// Agrupamento de áreas por DIRETORIA — a MESMA regra da tela Diretorias
// (/api/lideres): o líder da área é o topo interno (ou a âncora externa com
// mais raízes); o responsável é o primeiro na cadeia dele com nível 1–5
// (diretor 2–5; presidência 1). Extraída para o Painel somar colaboradores
// por diretoria com números idênticos aos da tela (ex.: Comercial inteiro
// conta no diretor Comercial, mesmo havendo um vice-diretor no meio).

// líder e diretor responsável de UMA área — mesma regra do mapa abaixo.
// Usado pelo organograma (card do diretor no topo do desenho) e pela troca
// de diretor. Retorna { lider, diretor } (objetos da linha global ou null).
export async function liderEDiretorDaArea(pool, setorId) {
  const { byId, porSetor, ord, calcularLider, responsavelDe } = await carregarBase(pool);
  const membros = porSetor.get(setorId) || [];
  if (membros.length === 0) return { lider: null, diretor: null, liderExibicao: null };
  const lider = calcularLider(setorId, membros);
  const diretor = lider ? responsavelDe(lider) : null;
  // líder DIRETO para exibição: quando o topo da área é o próprio diretor,
  // o líder direto é quem está logo abaixo dele dentro da área (modelo do
  // domínio: diretor acima, líder direto abaixo). Sem ninguém abaixo, o
  // próprio diretor acumula os dois papéis.
  let liderExibicao = lider;
  if (lider && diretor && lider.id === diretor.id) {
    const abaixo = membros
      .filter((m) => m.liderId === lider.id && m.id !== lider.id)
      .sort((a, b) => ord(a) - ord(b) || a.nome.localeCompare(b.nome, "pt-BR"));
    if (abaixo.length > 0) liderExibicao = abaixo[0];
  }
  return { lider, diretor, liderExibicao, byId };
}

// base compartilhada: linhas globais + índice + regra do líder/responsável
async function carregarBase(pool) {
  const rows = await carregarRows(pool);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const porSetor = new Map();
  for (const r of rows) {
    if (!r.setorId) continue;
    if (!porSetor.has(r.setorId)) porSetor.set(r.setorId, []);
    porSetor.get(r.setorId).push(r);
  }
  const ord = (r) => (r.ordem == null ? 99 : r.ordem);
  const ehResponsavel = (p) => p && p.ordem != null && p.ordem >= 1 && p.ordem <= 5;

  function responsavelDe(liderRow) {
    const vistos = new Set();
    let cur = liderRow;
    while (cur && !vistos.has(cur.id)) {
      vistos.add(cur.id);
      if (ehResponsavel(cur)) return cur;
      cur = cur.liderId ? byId.get(cur.liderId) : null;
    }
    return null;
  }

  // líder da área: raiz interna única; com várias, a âncora externa com mais
  // raízes penduradas; sem âncora, a raiz de nível mais alto
  function calcularLider(setorId, membros) {
    const raizes = membros.filter((m) => {
      if (!m.liderId) return true;
      const l = byId.get(m.liderId);
      return !l || l.setorId !== setorId;
    });
    if (raizes.length === 0) return null;
    raizes.sort((a, b) => ord(a) - ord(b) || a.nome.localeCompare(b.nome, "pt-BR"));
    if (raizes.length === 1) return raizes[0];
    const cont = new Map();
    raizes.forEach((r) => { if (r.liderId) cont.set(r.liderId, (cont.get(r.liderId) || 0) + 1); });
    let extId = null, max = 0;
    for (const [eid, n] of cont) if (n > max) { max = n; extId = eid; }
    return (extId && byId.get(extId)) || raizes[0];
  }

  return { rows, byId, porSetor, ord, calcularLider, responsavelDe };
}

async function carregarRows(pool) {
  const [rows] = await pool.query(
    `SELECT c.id, c.codigo_dp AS matricula, c.nome, c.setor_id AS setorId,
            c.lider_id AS liderId, COALESCE(nhp.ordem, nh.ordem) AS ordem,
            cg.nome AS cargo, COALESCE(nhp.familia, nh.familia) AS familia,
            COALESCE(nhp.cor, nh.cor) AS cor, c.local_id AS localId,
            s.nome AS setorNome
       FROM colaborador c
       LEFT JOIN cargo cg              ON cg.id = c.cargo_id
       LEFT JOIN nivel_hierarquico nh  ON nh.id = cg.nivel_id
       LEFT JOIN nivel_hierarquico nhp ON nhp.id = c.nivel_id
       LEFT JOIN setor s               ON s.id = c.setor_id
      WHERE c.ativo = 1`
  );
  return rows;
}

export async function mapaDiretorias(pool) {
  const { rows, porSetor, calcularLider, responsavelDe } = await carregarBase(pool);

  // total por responsável: soma das pessoas das áreas sob cada diretoria
  const porDiretoria = new Map(); // nome -> total
  let semDiretoria = 0;

  for (const [setorId, membros] of porSetor) {
    const lider = calcularLider(setorId, membros);
    const resp = lider ? responsavelDe(lider) : null;
    if (resp) porDiretoria.set(resp.nome, (porDiretoria.get(resp.nome) || 0) + membros.length);
    else semDiretoria += membros.length;
  }

  // quem não tem setor também não tem diretoria
  semDiretoria += rows.filter((r) => !r.setorId).length;

  const lista = [...porDiretoria.entries()]
    .map(([rotulo, n]) => ({ rotulo, n }))
    .sort((a, b) => b.n - a.n || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  if (semDiretoria > 0) lista.push({ rotulo: "Sem diretoria", n: semDiretoria });
  return { lista: lista.sort((a, b) => b.n - a.n), totalAtivos: rows.length };
}
