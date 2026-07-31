// Agrupamento de áreas por DIRETORIA — a MESMA regra da tela Diretorias
// (/api/lideres): o líder da área é o topo interno (ou a âncora externa com
// mais raízes); o responsável é o primeiro na cadeia dele com nível 1–5
// (diretor 2–5; presidência 1). Extraída para o Painel somar colaboradores
// por diretoria com números idênticos aos da tela (ex.: Comercial inteiro
// conta no diretor Comercial, mesmo havendo um vice-diretor no meio).

export async function mapaDiretorias(pool) {
  const [rows] = await pool.query(
    `SELECT c.id, c.codigo_dp AS matricula, c.nome, c.setor_id AS setorId,
            c.lider_id AS liderId, COALESCE(nhp.ordem, nh.ordem) AS ordem,
            s.nome AS setorNome
       FROM colaborador c
       LEFT JOIN cargo cg              ON cg.id = c.cargo_id
       LEFT JOIN nivel_hierarquico nh  ON nh.id = cg.nivel_id
       LEFT JOIN nivel_hierarquico nhp ON nhp.id = c.nivel_id
       LEFT JOIN setor s               ON s.id = c.setor_id
      WHERE c.ativo = 1`
  );

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

  // total por responsável: soma das pessoas das áreas sob cada diretoria
  const porDiretoria = new Map(); // nome -> total
  let semDiretoria = 0;

  for (const [setorId, membros] of porSetor) {
    const raizes = membros.filter((m) => {
      if (!m.liderId) return true;
      const l = byId.get(m.liderId);
      return !l || l.setorId !== setorId;
    });
    if (raizes.length === 0) { semDiretoria += membros.length; continue; }

    raizes.sort((a, b) => ord(a) - ord(b) || a.nome.localeCompare(b.nome, "pt-BR"));

    let lider;
    if (raizes.length === 1) {
      lider = raizes[0];
    } else {
      const cont = new Map();
      raizes.forEach((r) => { if (r.liderId) cont.set(r.liderId, (cont.get(r.liderId) || 0) + 1); });
      let extId = null, max = 0;
      for (const [eid, n] of cont) if (n > max) { max = n; extId = eid; }
      lider = (extId && byId.get(extId)) || raizes[0];
    }

    const resp = responsavelDe(lider);
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
