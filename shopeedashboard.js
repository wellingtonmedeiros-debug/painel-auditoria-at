(() => {
  const shopee = '#ee4d2d';
  const get = (selector) => document.querySelector(selector);
  let referenceDate = null;

  const style = document.createElement('style');
  style.textContent = `
    :root{--shopee:${shopee};--shopee-dark:#d83719;--shopee-pale:#fff0ec;--bg:#fff8f6;--text:#2d2d2d;--muted:#6d6d6d;--line:#f0d7d0}
    body{background:var(--bg);color:var(--text)} header{background:#fff!important;color:var(--text)!important;border-bottom:3px solid var(--shopee);padding:16px max(24px,calc((100% - 1320px)/2))!important}
    header h1{color:var(--shopee)} header p{color:var(--muted)!important}.brand{display:flex;align-items:center;gap:12px}.brand-logo{width:42px;height:42px;object-fit:contain}#headerStatus{background:var(--shopee-pale);color:var(--shopee-dark);padding:7px 10px;border-radius:99px;font-weight:650}
    .button{background:var(--shopee)!important}.button:hover{background:var(--shopee-dark)!important}.button.secondary{background:var(--shopee-pale)!important;color:var(--shopee-dark)!important}.upload{border-color:#efa290!important}.panel,.kpi{border-color:var(--line)!important}.field input,.field select{border-color:#e4c6be!important}.chart{border-color:var(--line)!important}
    .bar{background:var(--shopee)!important}.bar.ops{background:#f5b5a6!important}.bar-group{cursor:pointer}.bar-group.selected{background:var(--shopee-pale)}.bar-group.selected .bar{background:var(--shopee-dark)!important}.bar-group.selected .bar.ops{background:#ef7f67!important}
  `;
  document.head.append(style);

  const header = document.querySelector('header');
  header.innerHTML = `<div class="brand"><img class="brand-logo" src="https://www.pxpng.com/public/uploads/small/21631024127axfjp5fypxrovzfq5y2oxqokijy3bmoerbqrjbe9djdaigm2rce9ua2kcawstfzwccvsznolq9yvc9vndkloe7wwiwzrimqx3nch.png" alt="Shopee" referrerpolicy="no-referrer" onerror="this.style.display='none'"><div><h1>Painel de Auditoria AT</h1><p>Produtividade, ciclo de conferencia e oportunidades operacionais</p></div></div><div id="headerStatus">Aguardando arquivo</div>`;

  const sortField = get('#sortBy').closest('.field');
  sortField.insertAdjacentHTML('beforebegin', '<div class="field"><label for="hourFilter">Hora da conferencia</label><select id="hourFilter"><option value="">Todas as horas</option></select></div>');
  const hourFilter = get('#hourFilter');

  function hourOf(record) { return String(record.start.getHours()).padStart(2, '0') + 'h'; }
  function formatDate(date) { return date ? date.toLocaleDateString('pt-BR') : ''; }
  function dateFromFilename(name) {
    const match = String(name).match(/(20\d{2})[-_](\d{2})[-_](\d{2})/);
    return match ? new Date(+match[1], +match[2] - 1, +match[3]) : null;
  }
  function secondsToText(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '-';
    seconds = Math.round(seconds); const minutes = Math.floor(seconds / 60); const hours = Math.floor(minutes / 60);
    return (hours ? hours + 'h ' : '') + String(minutes % 60).padStart(2, '0') + 'm ' + String(seconds % 60).padStart(2, '0') + 's';
  }
  function number(value, decimals = 2) { return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }
  function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN; }

  function refreshHourOptions() {
    if (!raw.length) return;
    const current = hourFilter.value;
    const hours = [...new Set(raw.map(hourOf))].sort();
    hourFilter.innerHTML = '<option value="">Todas as horas</option>' + hours.map(hour => `<option value="${hour}">${hour}</option>`).join('');
    hourFilter.value = hours.includes(current) ? current : '';
  }

  function metricsFor(records, prodByHour) {
    const ordered = [...records].sort((a, b) => a.start - b.start);
    const durations = ordered.map(record => (record.end - record.start) / 1000);
    const idle = ordered.slice(0, -1).map((record, index) => (ordered[index + 1].start - record.end) / 1000).filter(value => value >= 0);
    const span = ordered.length ? (ordered.at(-1).end - ordered[0].start) / 3600000 : 0;
    return { records: ordered, count: ordered.length, duration: average(durations), idle: average(idle), cycle: average(durations) + average(idle), prod: prodByHour ? ordered.length : (span > 0 ? ordered.length / span : 0), span };
  }

  function applyHourFilter() {
    const hour = hourFilter.value;
    if (!hour || !raw.length) return;
    const min = +get('#minAts').value || 3;
    const target = +get('#target').value || 5;
    const operatorTerm = get('#operatorFilter').value.trim().toLowerCase();
    const sort = get('#sortBy').value;
    const fullGroups = new Map();
    raw.forEach(record => { if (!fullGroups.has(record.ops)) fullGroups.set(record.ops, []); fullGroups.get(record.ops).push(record); });
    const allowed = new Set([...fullGroups.entries()].filter(([, records]) => records.length >= min).map(([ops]) => ops));
    const byOps = new Map();
    raw.filter(record => record.start && hourOf(record) === hour && allowed.has(record.ops)).forEach(record => { if (!byOps.has(record.ops)) byOps.set(record.ops, []); byOps.get(record.ops).push(record); });
    let rows = [...byOps.entries()].map(([ops, records]) => {
      const item = metricsFor(records, true);
      const name = records.find(record => record.name && record.name !== '-')?.name || '-';
      return { ops, name, ...item };
    });
    const activeRows = rows;
    rows = rows.filter(row => !operatorTerm || (row.ops + ' ' + row.name).toLowerCase().includes(operatorTerm));
    rows.sort((a, b) => sort === 'count' ? b.count - a.count : sort === 'idle' ? b.idle - a.idle : b.prod - a.prod);
    const visibleRecords = activeRows.flatMap(row => row.records);
    const total = visibleRecords.length;
    const avgDuration = average(visibleRecords.map(record => (record.end - record.start) / 1000));
    const idleIntervals = activeRows.flatMap(row => row.records.slice(0, -1).map((record, index) => (row.records[index + 1].start - record.end) / 1000).filter(value => value >= 0));
    const avgIdle = average(idleIntervals);
    const productivity = activeRows.length ? total / activeRows.length : 0;
    const targetHits = activeRows.filter(row => row.prod >= target).length;
    get('#baseText').textContent = `${total} ATs · ${activeRows.length} Ops ativos · hora selecionada: ${hour}`;
    get('#rankingCount').textContent = `${rows.length} de ${activeRows.length} Ops em ${hour}`;
    get('#ranking').innerHTML = rows.map((row, index) => `<tr><td>${index + 1}</td><td>${row.ops}</td><td class="name">${row.name}</td><td class="num">${row.count}</td><td class="num ${row.prod >= target ? 'good' : 'bad'}">${number(row.prod)}</td><td class="num">${secondsToText(row.duration)}</td><td class="num">${secondsToText(row.idle)}</td><td class="num">${secondsToText(row.cycle)}</td><td class="num"><span class="tag ${row.prod >= target ? 'good' : 'bad'}">${number(row.prod / target * 100, 0)}%</span></td></tr>`).join('') || '<tr><td colspan="9" class="empty">Nenhum Ops ativo nesse horario.</td></tr>';
    const cards = [['ATs conferidas', total, `Hora ${hour}`], ['Produtividade da hora', number(productivity) + ' ATs/h', number(productivity / target * 100, 1) + '% da meta', productivity >= target ? 'good' : 'bad'], ['Gap para a meta', (productivity - target >= 0 ? '+' : '') + number(productivity - target) + ' ATs/h', productivity >= target ? 'Meta atingida' : 'Abaixo da meta', productivity >= target ? 'good' : 'bad'], ['Tempo medio de conferencia', secondsToText(avgDuration), 'ATs iniciadas na hora'], ['Tempo ocioso medio', secondsToText(avgIdle), 'Intervalos dentro da hora', 'warn'], ['Ciclo medio', secondsToText(avgDuration + avgIdle), 'Conferencia + ociosidade'], ['Ops >= meta', targetHits + ' / ' + activeRows.length, activeRows.length ? number(targetHits / activeRows.length * 100, 1) + '% do grupo' : '-', targetHits === activeRows.length ? 'good' : 'bad']];
    get('#kpis').innerHTML = cards.map(card => `<article class="kpi"><div class="label">${card[0]}</div><div class="value ${card[3] || ''}">${card[1]}</div><div class="status ${card[3] || ''}">${card[2]}</div></article>`).join('');
  }

  function wireChart() {
    document.querySelectorAll('#hourlyChart .bar-group').forEach(group => {
      const label = group.querySelector('.bar-label'); if (!label) return;
      const hour = label.textContent.trim(); group.dataset.hour = hour; group.setAttribute('role', 'button'); group.setAttribute('tabindex', '0');
      group.classList.toggle('selected', hourFilter.value === hour);
      group.onclick = () => { hourFilter.value = hourFilter.value === hour ? '' : hour; render(); };
      group.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); group.click(); } };
    });
  }

  const legacyRender = render;
  render = function () { legacyRender(); refreshHourOptions(); wireChart(); applyHourFilter(); };
  hourFilter.addEventListener('change', () => render());
  get('#csvFile').addEventListener('change', event => {
    const file = event.target.files[0]; if (!file) return;
    referenceDate = dateFromFilename(file.name);
    get('#headerStatus').textContent = referenceDate ? `Auditoria: ${formatDate(referenceDate)}` : 'Arquivo carregado';
    const waitForData = () => {
      if (raw.length) { const info = get('#fileInfo'); info.textContent = `${raw.length} registros validos · ${file.name}`; render(); }
      else setTimeout(waitForData, 40);
    };
    setTimeout(waitForData, 40);
  });
  get('#clearBtn').addEventListener('click', () => { referenceDate = null; get('#headerStatus').textContent = 'Aguardando arquivo'; hourFilter.value = ''; });
})();
