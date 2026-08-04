/* =========================================================================
   rendimiento.js — Indicadores diarios de los agentes
   Carga manual o por Excel/CSV, panel, ranking, comparativo por skill,
   detalle editable y configuración de indicadores con metas.
   ========================================================================= */

'use strict';

const Rend = {

  init() {
    Rend.pintarSelectores();
    Rend.pintarCamposManual();
    Rend.pintarDatalists();
    const f = State.ui.filtros || {};
    const r = App.rangoDatos(State.registros);
    document.getElementById('fDesde').value = f.desde || r.min;
    document.getElementById('fHasta').value = f.hasta || r.max;
    document.getElementById('fSkill').value = f.skill || '';
    document.getElementById('fBuscar').value = f.buscar || '';
    document.getElementById('mFecha').value = U.hoy();
  },

  /* ------------------------------ Selectores ----------------------------- */
  pintarSelectores() {
    const inds = App.indicadoresActivos();
    ['rTrendMetric', 'rSkillMetric'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const previo = sel.value;
      sel.innerHTML = inds.map(m => '<option value="' + m.id + '">' + U.esc(m.nombre) + '</option>').join('');
      if (previo && inds.some(m => m.id === previo)) sel.value = previo;
    });
    const sk = document.getElementById('fSkill');
    const prev = sk.value;
    sk.innerHTML = '<option value="">Todos</option>' + App.skills().map(s => '<option>' + U.esc(s) + '</option>').join('');
    sk.value = prev;
  },

  pintarDatalists() {
    document.getElementById('dlAgentes').innerHTML = App.agentes().map(a => '<option value="' + U.esc(a.nombre) + '">').join('');
    document.getElementById('dlSkills').innerHTML = App.skills().map(s => '<option value="' + U.esc(s) + '">').join('');
  },

  pintarCamposManual() {
    const host = document.getElementById('mMetricFields');
    host.innerHTML = App.indicadoresActivos().map(m =>
      '<div class="field"><label for="mv-' + m.id + '">' + U.esc(m.nombre) + Rend.sufijo(m) + '</label>' +
      '<input type="text" id="mv-' + m.id + '" inputmode="decimal" placeholder="' + Rend.placeholder(m) + '"></div>'
    ).join('');
  },

  sufijo(m) {
    return m.unidad === 'pct' ? ' (%)' : m.unidad === 'seg' ? ' (mm:ss o segundos)' : m.unidad === 'min' ? ' (min)' : '';
  },
  placeholder(m) {
    return m.unidad === 'pct' ? 'Ej. 92,5' : m.unidad === 'seg' ? 'Ej. 05:30' : m.unidad === 'moneda' ? 'Ej. 250000' : 'Ej. 58';
  },

  /* -------------------------------- Filtros ------------------------------ */
  onFilter() {
    State.ui.filtros = {
      desde: document.getElementById('fDesde').value,
      hasta: document.getElementById('fHasta').value,
      skill: document.getElementById('fSkill').value,
      buscar: document.getElementById('fBuscar').value
    };
    App.guardar();
    Rend.render();
  },

  preset(tipo) {
    const r = App.rangoDatos(State.registros);
    const hoy = r.max || U.hoy();
    let desde = r.min, hasta = hoy;
    if (tipo === 'hoy') desde = hoy;
    else if (tipo === '7') desde = U.addDays(hoy, -6);
    else if (tipo === '30') desde = U.addDays(hoy, -29);
    else if (tipo === 'mes') desde = hoy.slice(0, 8) + '01';
    document.getElementById('fDesde').value = desde;
    document.getElementById('fHasta').value = hasta;
    Rend.onFilter();
  },

  filtrados() {
    const f = State.ui.filtros || {};
    const b = U.norm(f.buscar || '');
    return State.registros.filter(r => {
      if (f.desde && r.fecha < f.desde) return false;
      if (f.hasta && r.fecha > f.hasta) return false;
      if (f.skill && r.skill !== f.skill) return false;
      if (b && U.norm(r.agente + ' ' + (r.doc || '')).indexOf(b) < 0) return false;
      return true;
    });
  },

  /** Registros del periodo inmediatamente anterior, del mismo largo. */
  periodoAnterior() {
    const f = State.ui.filtros || {};
    if (!f.desde || !f.hasta) return [];
    const dias = Math.round((new Date(f.hasta) - new Date(f.desde)) / 86400000) + 1;
    const hasta = U.addDays(f.desde, -1), desde = U.addDays(hasta, -(dias - 1));
    const b = U.norm(f.buscar || '');
    return State.registros.filter(r => r.fecha >= desde && r.fecha <= hasta &&
      (!f.skill || r.skill === f.skill) && (!b || U.norm(r.agente).indexOf(b) > -1));
  },

  /* ------------------------------- Render -------------------------------- */
  render() {
    Rend.pintarSelectores();
    Rend.pintarDatalists();
    const tab = State.ui.tabs.rendimiento || 'r-panel';
    if (tab === 'r-panel') Rend.renderPanel();
    else if (tab === 'r-ranking') Rend.renderRanking();
    else if (tab === 'r-skills') Rend.renderSkills();
    else if (tab === 'r-datos') Rend.renderDatos();
    else if (tab === 'r-indicadores') Rend.renderIndicadores();
  },

  renderPanel() {
    const regs = Rend.filtrados();
    const prev = Rend.periodoAnterior();
    const inds = App.indicadoresActivos();

    /* --- KPI --- */
    const puntaje = App.puntaje(regs), puntajePrev = App.puntaje(prev);
    const agentes = new Set(regs.map(r => r.agente)).size;
    const dias = new Set(regs.map(r => r.fecha)).size;

    let html = '';
    if (!regs.length) {
      html = '<div class="kpi" style="grid-column:1/-1"><div class="kpi__label">Sin información</div>' +
        '<div class="kpi__value" style="font-size:18px">Aún no hay registros en este periodo</div>' +
        '<div class="kpi__foot">Ve a <strong>Cargar datos</strong> para subir tu Excel o registrar manualmente. También puedes probar con datos de ejemplo desde Ajustes.</div></div>';
    } else {
      html += '<div class="kpi kpi--hero"><div class="kpi__label">Puntaje global del equipo</div>' +
        '<div class="kpi__value">' + (puntaje == null ? '—' : U.dec(puntaje, 1) + '%') + '</div>' +
        '<div class="kpi__foot">' + Rend.deltaHTML(puntaje, puntajePrev, 'up', 'pct') +
        '<span>' + agentes + ' agentes · ' + dias + ' días</span></div></div>';

      inds.slice(0, 5).forEach(ind => {
        const v = U.prom(regs.map(r => r.valores && r.valores[ind.id]));
        const vp = U.prom(prev.map(r => r.valores && r.valores[ind.id]));
        const est = App.estadoCumplimiento(App.cumplimiento(v, ind));
        html += '<div class="kpi"><div class="kpi__label">' + U.esc(ind.nombre) + '</div>' +
          '<div class="kpi__value">' + U.fmt(v, ind.unidad) + '</div>' +
          '<div class="kpi__foot">' + Rend.deltaHTML(v, vp, ind.direccion, ind.unidad) +
          '<span class="badge ' + est.clase + '">' + est.etiqueta + '</span></div></div>';
      });
    }
    document.getElementById('rKpis').innerHTML = html;

    /* --- Tendencia diaria --- */
    const mid = document.getElementById('rTrendMetric').value || (inds[0] && inds[0].id);
    const ind = App.indicador(mid) || inds[0];
    const fechas = [...new Set(regs.map(r => r.fecha))].sort();
    if (ind) {
      const valores = fechas.map(f => U.prom(regs.filter(r => r.fecha === f).map(r => r.valores && r.valores[ind.id])));
      document.getElementById('rTrendSub').textContent = 'Promedio diario del equipo · ' + ind.nombre;
      Chart.line('rTrend', {
        labels: fechas, series: [{ nombre: ind.nombre, valores: valores }],
        unidad: ind.unidad, meta: ind.meta, area: true, formatX: (f, largo) => largo ? U.fechaLarga(f) : U.fechaCorta(f),
        tituloX: 'Fecha', vacio: 'Carga registros para ver la tendencia.'
      });
    }

    /* --- Medidores --- */
    document.getElementById('rMeters').innerHTML = regs.length
      ? inds.map(m => Chart.meterHTML(m.nombre, U.prom(regs.map(r => r.valores && r.valores[m.id])), m)).join('')
      : '<div class="empty">Sin datos en el periodo</div>';

    /* --- Top / Bottom --- */
    const rank = Rend.ranking(regs);
    const top = rank.slice(0, 5), bottom = rank.slice(-5).reverse();
    Chart.bars('rTop', {
      labels: top.map(a => a.agente), valores: top.map(a => a.puntaje), unidad: 'pct',
      color: Chart.css('--s3'), horizontal: true, meta: 100, nombreSerie: 'Puntaje global',
      nota: 'Puntaje global: promedio ponderado del cumplimiento de cada indicador contra su meta.'
    });
    Chart.bars('rBottom', {
      labels: bottom.map(a => a.agente), valores: bottom.map(a => a.puntaje), unidad: 'pct',
      color: Chart.css('--s6'), horizontal: true, meta: 100, nombreSerie: 'Puntaje global',
      nota: 'Agentes con mayor oportunidad de acompañamiento en el periodo.'
    });
  },

  deltaHTML(actual, previo, direccion, unidad) {
    if (actual == null || previo == null || !isFinite(previo) || previo === 0) return '<span>Sin comparativo</span>';
    const d = actual - previo;
    const mejora = direccion === 'down' ? d < 0 : d > 0;
    if (Math.abs(d) < 1e-9) return '<span>Igual que el periodo anterior</span>';
    return '<span class="delta ' + (mejora ? 'delta--up' : 'delta--down') + '">' + (d > 0 ? '▲' : '▼') + ' ' +
      U.fmt(Math.abs(d), unidad) + '</span><span>vs. periodo anterior</span>';
  },

  /* ------------------------------- Ranking ------------------------------- */
  ranking(regs) {
    const porAgente = new Map();
    regs.forEach(r => {
      if (!porAgente.has(r.agente)) porAgente.set(r.agente, []);
      porAgente.get(r.agente).push(r);
    });
    return [...porAgente.entries()].map(([agente, rs]) => {
      const fila = { agente: agente, dias: new Set(rs.map(r => r.fecha)).size, skill: rs[rs.length - 1].skill || '', valores: {} };
      App.indicadoresActivos().forEach(m => { fila.valores[m.id] = U.prom(rs.map(r => r.valores && r.valores[m.id])); });
      fila.puntaje = App.puntaje(rs);
      return fila;
    }).sort((a, b) => (b.puntaje == null ? -1 : b.puntaje) - (a.puntaje == null ? -1 : a.puntaje));
  },

  renderRanking() {
    const rank = Rend.ranking(Rend.filtrados());
    const inds = App.indicadoresActivos();
    const host = document.getElementById('rRankingTable');
    if (!rank.length) { host.innerHTML = '<div class="empty"><strong>Sin agentes en el periodo</strong>Ajusta los filtros o carga datos.</div>'; return; }
    const maxP = Math.max(...rank.map(r => r.puntaje || 0), 100);

    host.innerHTML = '<table class="data"><thead><tr>' +
      '<th class="no-sort">#</th><th class="no-sort">Agente</th><th class="no-sort">Skill</th><th class="num no-sort">Días</th>' +
      inds.map(m => '<th class="num no-sort">' + U.esc(m.nombre) + '</th>').join('') +
      '<th class="num no-sort">Puntaje global</th><th class="no-sort">Estado</th></tr></thead><tbody>' +
      rank.map((r, i) => {
        const est = App.estadoCumplimiento(r.puntaje == null ? null : r.puntaje / 100);
        return '<tr>' +
          '<td class="rank">' + (i + 1) + '</td>' +
          '<td class="name">' + U.esc(r.agente) + '</td>' +
          '<td>' + U.esc(r.skill || '—') + '</td>' +
          '<td class="num">' + r.dias + '</td>' +
          inds.map(m => {
            const c = App.cumplimiento(r.valores[m.id], m);
            const col = c == null ? 'var(--ink-muted)' : c >= 1 ? 'var(--ok)' : c >= .9 ? 'var(--warn)' : 'var(--bad)';
            return '<td class="num" style="color:' + col + ';font-weight:600">' + U.fmt(r.valores[m.id], m.unidad) + '</td>';
          }).join('') +
          '<td class="num"><div class="bar-cell"><div class="bar-cell__track"><div class="bar-cell__fill" style="width:' +
            U.clamp((r.puntaje || 0) / maxP * 100, 0, 100).toFixed(0) + '%;background:' + est.color + '"></div></div>' +
            '<strong>' + (r.puntaje == null ? '—' : U.dec(r.puntaje, 1) + '%') + '</strong></div></td>' +
          '<td><span class="badge ' + est.clase + '">' + est.etiqueta + '</span></td></tr>';
      }).join('') + '</tbody></table>';
  },

  exportRanking() {
    const rank = Rend.ranking(Rend.filtrados());
    if (!rank.length) return App.toast('Nada que exportar', '', 'bad');
    const inds = App.indicadoresActivos();
    const filas = [['Posición', 'Agente', 'Skill', 'Días'].concat(inds.map(m => m.nombre)).concat(['Puntaje global %'])];
    rank.forEach((r, i) => filas.push([i + 1, r.agente, r.skill, r.dias]
      .concat(inds.map(m => r.valores[m.id] == null ? '' : String(r.valores[m.id]).replace('.', ',')))
      .concat([r.puntaje == null ? '' : r.puntaje.toFixed(1).replace('.', ',')])));
    U.descargar('ranking-' + U.hoy() + '.csv', U.csv(filas), 'text/csv');
  },

  /* ------------------------------ Por skill ------------------------------ */
  renderSkills() {
    const regs = Rend.filtrados();
    const inds = App.indicadoresActivos();
    const mid = document.getElementById('rSkillMetric').value || (inds[0] && inds[0].id);
    const ind = App.indicador(mid) || inds[0];
    const skills = [...new Set(regs.map(r => r.skill || 'Sin skill'))].sort();

    if (!ind || !skills.length) {
      Chart.vacio(document.getElementById('rSkillBar'), 'Sin datos por skill', 'Carga registros que incluyan la columna de skill.');
      Chart.vacio(document.getElementById('rSkillLine'), 'Sin datos por skill', '');
      document.getElementById('rSkillTable').innerHTML = '<div class="empty">Sin datos</div>';
      return;
    }

    const prom = s => U.prom(regs.filter(r => (r.skill || 'Sin skill') === s).map(r => r.valores && r.valores[ind.id]));
    const datos = skills.map(s => ({ s: s, v: prom(s) })).sort((a, b) => (b.v || 0) - (a.v || 0));
    Chart.bars('rSkillBar', {
      labels: datos.map(d => d.s), valores: datos.map(d => d.v), unidad: ind.unidad,
      color: Chart.css('--s1'), horizontal: true, meta: ind.meta, nombreSerie: ind.nombre
    });

    // Máximo 6 skills en el mismo eje: el resto se agrupa
    const fechas = [...new Set(regs.map(r => r.fecha))].sort();
    const orden = datos.map(d => d.s);
    const principales = orden.slice(0, 6), resto = orden.slice(6);
    const series = principales.map((s, i) => ({
      nombre: s, color: Chart.color(i),
      valores: fechas.map(f => U.prom(regs.filter(r => r.fecha === f && (r.skill || 'Sin skill') === s).map(r => r.valores && r.valores[ind.id])))
    }));
    if (resto.length) series.push({
      nombre: 'Otros (' + resto.length + ')', color: Chart.css('--series-muted'),
      valores: fechas.map(f => U.prom(regs.filter(r => r.fecha === f && resto.indexOf(r.skill || 'Sin skill') > -1).map(r => r.valores && r.valores[ind.id])))
    });
    Chart.line('rSkillLine', {
      labels: fechas, series: series, unidad: ind.unidad, meta: ind.meta,
      formatX: (f, largo) => largo ? U.fechaLarga(f) : U.fechaCorta(f), tituloX: 'Fecha'
    });

    document.getElementById('rSkillTable').innerHTML =
      '<table class="data"><thead><tr><th class="no-sort">Skill</th><th class="num no-sort">Agentes</th><th class="num no-sort">Registros</th>' +
      inds.map(m => '<th class="num no-sort">' + U.esc(m.nombre) + '</th>').join('') + '<th class="num no-sort">Puntaje</th></tr></thead><tbody>' +
      skills.map(s => {
        const rs = regs.filter(r => (r.skill || 'Sin skill') === s);
        const p = App.puntaje(rs);
        return '<tr><td class="name">' + U.esc(s) + '</td><td class="num">' + new Set(rs.map(r => r.agente)).size + '</td><td class="num">' + rs.length + '</td>' +
          inds.map(m => '<td class="num">' + U.fmt(U.prom(rs.map(r => r.valores && r.valores[m.id])), m.unidad) + '</td>').join('') +
          '<td class="num"><strong>' + (p == null ? '—' : U.dec(p, 1) + '%') + '</strong></td></tr>';
      }).join('') + '</tbody></table>';
  },

  /* ------------------------- Detalle de registros ------------------------ */
  renderDatos() {
    const regs = Rend.filtrados().slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || a.agente.localeCompare(b.agente, 'es'));
    const inds = App.indicadoresActivos();
    const host = document.getElementById('rDataTable');
    document.getElementById('rDatosSub').textContent = regs.length + ' registros · haz doble clic en un valor para corregirlo';

    if (!regs.length) { host.innerHTML = '<div class="empty"><strong>Sin registros</strong>Carga un Excel o agrega manualmente desde la pestaña Cargar datos.</div>'; return; }

    host.innerHTML = '<table class="data"><thead><tr><th class="no-sort">Fecha</th><th class="no-sort">Agente</th><th class="no-sort">Documento</th><th class="no-sort">Skill</th>' +
      inds.map(m => '<th class="num no-sort">' + U.esc(m.nombre) + '</th>').join('') +
      '<th class="no-sort">Observación</th><th class="no-sort"></th></tr></thead><tbody>' +
      regs.slice(0, 800).map(r =>
        '<tr data-id="' + r.id + '"><td>' + U.fechaCorta(r.fecha) + ' ' + r.fecha.slice(0, 4) + '</td>' +
        '<td class="name">' + U.esc(r.agente) + '</td><td>' + U.esc(r.doc || '—') + '</td><td>' + U.esc(r.skill || '—') + '</td>' +
        inds.map(m => '<td class="num"><span class="cell-edit" ondblclick="Rend.editarCelda(this,\'' + r.id + '\',\'' + m.id + '\')">' +
          U.fmt(r.valores && r.valores[m.id], m.unidad) + '</span></td>').join('') +
        '<td>' + U.esc(r.nota || '') + '</td>' +
        '<td><button class="icon-btn icon-btn--danger" type="button" title="Eliminar" onclick="Rend.borrarRegistro(\'' + r.id + '\')">✕</button></td></tr>'
      ).join('') + '</tbody></table>' +
      (regs.length > 800 ? '<p class="chart-note" style="padding:8px 12px">Se muestran los primeros 800 registros. Ajusta los filtros para ver el resto.</p>' : '');
  },

  editarCelda(span, regId, metricId) {
    const reg = State.registros.find(r => r.id === regId);
    const ind = App.indicador(metricId);
    if (!reg || !ind) return;
    const actual = reg.valores && reg.valores[metricId];
    const input = document.createElement('input');
    input.type = 'text';
    input.value = actual == null ? '' : (ind.unidad === 'seg' ? U.secToHms(actual) : String(actual).replace('.', ','));
    input.style.width = '90px';
    span.replaceWith(input);
    input.focus(); input.select();
    const cerrar = () => {
      const v = Rend.valorIndicador(input.value, ind);
      if (!reg.valores) reg.valores = {};
      if (v == null) delete reg.valores[metricId]; else reg.valores[metricId] = v;
      App.guardarYa().then(() => Rend.renderDatos());
    };
    input.addEventListener('blur', cerrar);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') Rend.renderDatos(); });
  },

  async borrarRegistro(id) {
    const i = State.registros.findIndex(r => r.id === id);
    if (i < 0) return;
    State.registros.splice(i, 1);
    await App.guardarYa();
    Rend.render();
    App.toast('Registro eliminado', '', 'ok');
  },

  async borrarFiltrados() {
    const regs = Rend.filtrados();
    if (!regs.length) return App.toast('No hay registros filtrados', '', 'bad');
    const ok = await App.confirmar('Borrar registros', 'Se eliminarán ' + regs.length + ' registros que cumplen los filtros actuales.');
    if (!ok) return;
    const ids = new Set(regs.map(r => r.id));
    State.registros = State.registros.filter(r => !ids.has(r.id));
    await App.guardarYa();
    Rend.render();
    App.toast('Registros eliminados', regs.length + ' filas', 'ok');
  },

  exportRegistros() {
    const regs = Rend.filtrados();
    if (!regs.length) return App.toast('Nada que exportar', '', 'bad');
    const inds = App.indicadoresActivos();
    const filas = [['Fecha', 'Agente', 'Documento', 'Skill'].concat(inds.map(m => m.nombre)).concat(['Observación'])];
    regs.forEach(r => filas.push([r.fecha, r.agente, r.doc || '', r.skill || '']
      .concat(inds.map(m => { const v = r.valores && r.valores[m.id]; return v == null ? '' : String(v).replace('.', ','); }))
      .concat([r.nota || ''])));
    U.descargar('rendimiento-' + U.hoy() + '.csv', U.csv(filas), 'text/csv');
  },

  /* ------------------------------ Carga manual --------------------------- */
  valorIndicador(bruto, ind) {
    if (bruto == null || String(bruto).trim() === '') return null;
    let v = U.num(bruto);
    if (v == null) return null;
    if (ind.unidad === 'seg' && /^\d+(\.\d+)?$/.test(String(bruto).trim()) === false && String(bruto).indexOf(':') < 0) return v;
    return v;
  },

  async guardarManual(ev) {
    ev.preventDefault();
    const fecha = document.getElementById('mFecha').value;
    const agente = document.getElementById('mAgente').value.trim();
    if (!fecha || !agente) return;
    const valores = {};
    App.indicadoresActivos().forEach(m => {
      const v = Rend.valorIndicador(document.getElementById('mv-' + m.id).value, m);
      if (v != null) valores[m.id] = v;
    });
    const doc = document.getElementById('mDoc').value.trim();
    const skill = document.getElementById('mSkill').value.trim();
    const nota = document.getElementById('mNota').value.trim();

    const existente = State.registros.find(r => r.fecha === fecha && U.norm(r.agente) === U.norm(agente));
    if (existente) {
      Object.assign(existente, { doc: doc || existente.doc, skill: skill || existente.skill, nota: nota || existente.nota });
      existente.valores = Object.assign({}, existente.valores, valores);
    } else {
      State.registros.push({ id: U.uid('reg'), fecha: fecha, agente: agente, doc: doc, skill: skill, valores: valores, nota: nota });
    }
    await App.guardarYa();
    ev.target.reset();
    document.getElementById('mFecha').value = fecha;
    Rend.init(); Rend.render();
    App.toast(existente ? 'Registro actualizado' : 'Registro guardado', agente + ' · ' + U.fechaCorta(fecha), 'ok');
  },

  /* --------------------------- Carga por archivo ------------------------- */
  onDrop(ev) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('is-over');
    const f = ev.dataTransfer.files[0];
    if (f) Rend.procesar(f);
  },
  onFile(ev) { const f = ev.target.files[0]; if (f) Rend.procesar(f); ev.target.value = ''; },

  async procesar(file) {
    try {
      const libro = await Sheets.leer(file);
      const campos = [
        { key: 'fecha', label: 'Fecha', req: true, alias: ['dia', 'día', 'date', 'fecha gestion', 'fecha de gestion'] },
        { key: 'agente', label: 'Agente', req: true, alias: ['nombre agente', 'nombre_agente', 'asesor', 'nombre', 'nombre completo', 'nombre_completo', 'empleado', 'usuario', 'agent', 'colaborador'] },
        { key: 'doc', label: 'Documento / ID', alias: ['documento', 'cedula', 'cédula', 'identificacion', 'id', 'cc'] },
        { key: 'skill', label: 'Skill', alias: ['servicio', 'campaña', 'campana', 'cola', 'linea', 'línea', 'grupo', 'equipo', 'skill'] },
        { key: 'nota', label: 'Observación', alias: ['comentario', 'novedad', 'observaciones'] }
      ].concat(App.indicadoresActivos().map(m => ({
        key: 'ind:' + m.id, label: m.nombre, alias: Rend.aliasIndicador(m),
        ayuda: 'Meta ' + U.fmt(m.meta, m.unidad) + (m.direccion === 'down' ? ' o menos' : ' o más')
      })));

      Mapper.abrir({
        host: 'rendMapper', libro: libro, campos: campos, filtroFechas: true,
        extra: '<label class="checkline" style="margin-top:4px"><input type="checkbox" data-opcion="reemplazar"> Borrar los registros existentes antes de importar</label>',
        onImportar: Rend.importar
      });
    } catch (e) {
      App.toast('No se pudo leer el archivo', e.message || 'Formato no reconocido', 'bad');
    }
  },

  aliasIndicador(m) {
    const base = { llamadas: ['gestiones', 'llamadas', 'atendidas', 'contactos', 'interacciones', 'calls'],
      tmo: ['tmo', 'aht', 'tiempo medio', 'tiempo promedio', 'duracion promedio'],
      calidad: ['calidad', 'quality', 'monitoreo', 'auditoria'],
      adherencia: ['adherencia', 'cumplimiento horario', 'schedule adherence'],
      csat: ['csat', 'satisfaccion', 'satisfacción', 'encuesta', 'nps'],
      conversion: ['conversion', 'conversión', 'efectividad', 'ventas', 'cierre'] };
    return (base[m.id] || []).concat([m.nombre]);
  },

  async importar(mapeo, filas, opciones) {
    const inds = App.indicadoresActivos();

    // ¿Los porcentajes vienen como fracción (0,92) en lugar de 92?
    const fraccion = {};
    inds.forEach(m => {
      if (m.unidad !== 'pct' || mapeo['ind:' + m.id] == null) return;
      const vals = filas.map(f => U.num(f[mapeo['ind:' + m.id]])).filter(v => v != null);
      fraccion[m.id] = vals.length > 0 && vals.every(v => v >= 0 && v <= 1) && vals.some(v => v > 0);
    });

    const permitidas = opciones.fechas ? new Set(opciones.fechas) : null;
    const nuevos = [];
    let saltadas = 0, fueraDeRango = 0;
    filas.forEach(f => {
      const fecha = U.parseFecha(f[mapeo.fecha]);
      const agente = String(f[mapeo.agente] == null ? '' : f[mapeo.agente]).trim();
      if (!fecha || !agente) { saltadas++; return; }
      if (permitidas && !permitidas.has(fecha)) { fueraDeRango++; return; }
      const valores = {};
      inds.forEach(m => {
        const col = mapeo['ind:' + m.id];
        if (col == null) return;
        let v = U.num(f[col]);
        if (v == null) return;
        if (m.unidad === 'pct' && fraccion[m.id]) v = v * 100;
        if (m.unidad === 'seg' && typeof f[col] === 'number' && f[col] > 0 && f[col] < 1) v = Math.round(f[col] * 86400);
        valores[m.id] = v;
      });
      nuevos.push({
        id: U.uid('reg'), fecha: fecha, agente: agente,
        doc: mapeo.doc != null ? String(f[mapeo.doc] == null ? '' : f[mapeo.doc]).trim() : '',
        skill: mapeo.skill != null ? String(f[mapeo.skill] == null ? '' : f[mapeo.skill]).trim() : '',
        nota: mapeo.nota != null ? String(f[mapeo.nota] == null ? '' : f[mapeo.nota]).trim() : '',
        valores: valores
      });
    });

    if (!nuevos.length) { App.toast('No se importó nada', 'Revisa que las columnas de fecha y agente estén bien asignadas.', 'bad'); return; }

    if (opciones.reemplazar) State.registros = [];
    // Un registro por agente y día: si ya existe, se actualiza
    let actualizados = 0;
    nuevos.forEach(n => {
      const prev = State.registros.find(r => r.fecha === n.fecha && U.norm(r.agente) === U.norm(n.agente));
      if (prev) {
        prev.valores = Object.assign({}, prev.valores, n.valores);
        if (n.skill) prev.skill = n.skill;
        if (n.doc) prev.doc = n.doc;
        if (n.nota) prev.nota = n.nota;
        actualizados++;
      } else State.registros.push(n);
    });

    await App.guardarYa();
    Mapper.cerrar();
    const r = App.rangoDatos(State.registros);
    State.ui.filtros = { desde: r.min, hasta: r.max, skill: '', buscar: '' };
    Rend.init(); Agentes.init(); Turnos.init();
    App.go('rendimiento');
    App.toast('Importación completada',
      (nuevos.length - actualizados) + ' nuevos, ' + actualizados + ' actualizados' +
      (fueraDeRango ? ', ' + fueraDeRango + ' filas de días no seleccionados' : '') +
      (saltadas ? ', ' + saltadas + ' filas sin fecha o agente' : ''), 'ok');
  },

  plantilla() {
    const inds = App.indicadoresActivos();
    const filas = [['Fecha', 'Agente', 'Documento', 'Skill'].concat(inds.map(m => m.nombre)).concat(['Observación'])];
    const ej = ['2026-08-03', 'María Gómez', '1010101010', 'Ventas'];
    filas.push(ej.concat(inds.map(m => m.unidad === 'seg' ? '05:20' : m.unidad === 'pct' ? '93,5' : '62')).concat(['']));
    filas.push(['2026-08-03', 'Carlos Ruiz', '1020304050', 'Retención'].concat(inds.map(m => m.unidad === 'seg' ? '06:10' : m.unidad === 'pct' ? '88,0' : '54')).concat(['']));
    U.descargar('plantilla-rendimiento.csv', U.csv(filas), 'text/csv');
    App.toast('Plantilla descargada', 'Ábrela en Excel, llénala y súbela aquí.', 'ok');
  },

  /* ---------------------------- Indicadores ------------------------------ */
  renderIndicadores() {
    const host = document.getElementById('rMetricTable');
    host.innerHTML = '<table class="data"><thead><tr>' +
      '<th class="no-sort">Indicador</th><th class="no-sort">Unidad</th><th class="num no-sort">Meta</th>' +
      '<th class="no-sort">Mejor cuando</th><th class="num no-sort">Peso</th><th class="no-sort">Activo</th><th class="no-sort"></th>' +
      '</tr></thead><tbody>' +
      State.indicadores.map(m =>
        '<tr><td class="name">' + U.esc(m.nombre) + '</td>' +
        '<td>' + ({ num: 'Número', pct: 'Porcentaje', seg: 'Tiempo', min: 'Minutos', moneda: 'Moneda' }[m.unidad] || m.unidad) + '</td>' +
        '<td class="num">' + U.fmt(m.meta, m.unidad) + '</td>' +
        '<td>' + (m.direccion === 'down' ? '↓ Es menor' : '↑ Es mayor') + '</td>' +
        '<td class="num">' + (m.peso || 1) + '</td>' +
        '<td><label class="checkline"><input type="checkbox" ' + (m.activo !== false ? 'checked' : '') + ' onchange="Rend.toggleIndicador(\'' + m.id + '\',this.checked)"></label></td>' +
        '<td><button class="icon-btn" type="button" title="Editar" onclick="Rend.editarIndicador(\'' + m.id + '\')">✎</button> ' +
            '<button class="icon-btn icon-btn--danger" type="button" title="Eliminar" onclick="Rend.borrarIndicador(\'' + m.id + '\')">✕</button></td></tr>'
      ).join('') + '</tbody></table>';
  },

  async toggleIndicador(id, activo) {
    const m = App.indicador(id); if (!m) return;
    m.activo = activo;
    await App.guardarYa();
    Rend.init(); Agentes.init(); App.repintar();
  },

  nuevoIndicador() { Rend.editarIndicador(null); },

  editarIndicador(id) {
    const m = id ? App.indicador(id) : { id: '', nombre: '', unidad: 'num', meta: 100, direccion: 'up', peso: 1, activo: true };
    if (!m) return;
    App.modal({
      titulo: id ? 'Editar indicador' : 'Nuevo indicador',
      cuerpo:
        '<div class="form-grid">' +
        '<div class="field field--full"><label for="miNombre">Nombre</label><input type="text" id="miNombre" value="' + U.esc(m.nombre) + '" placeholder="Ej. Nivel de servicio"></div>' +
        '<div class="field"><label for="miUnidad">Unidad</label><select id="miUnidad">' +
          ['num|Número', 'pct|Porcentaje', 'seg|Tiempo (mm:ss)', 'min|Minutos', 'moneda|Moneda'].map(o => {
            const [v, t] = o.split('|');
            return '<option value="' + v + '"' + (m.unidad === v ? ' selected' : '') + '>' + t + '</option>';
          }).join('') + '</select></div>' +
        '<div class="field"><label for="miMeta">Meta</label><input type="text" id="miMeta" value="' + (m.unidad === 'seg' ? U.secToHms(m.meta) : m.meta) + '"></div>' +
        '<div class="field"><label for="miDir">El resultado es mejor cuando</label><select id="miDir">' +
          '<option value="up"' + (m.direccion === 'up' ? ' selected' : '') + '>Es mayor (ventas, calidad…)</option>' +
          '<option value="down"' + (m.direccion === 'down' ? ' selected' : '') + '>Es menor (TMO, abandono…)</option></select></div>' +
        '<div class="field"><label for="miPeso">Peso en el puntaje global</label><input type="number" id="miPeso" min="0" step="0.5" value="' + (m.peso || 1) + '"></div>' +
        '</div><p class="hint" style="margin-top:10px">El indicador aparece como columna en la carga, como gráfico en el panel y como parte del puntaje global.</p>',
      pie: '<button class="btn btn--ghost" type="button" onclick="App.cerrarModal()">Cancelar</button>' +
           '<button class="btn btn--primary" type="button" onclick="Rend.guardarIndicador(' + (id ? "'" + id + "'" : 'null') + ')">Guardar</button>'
    });
  },

  async guardarIndicador(id) {
    const nombre = document.getElementById('miNombre').value.trim();
    if (!nombre) return App.toast('Falta el nombre', '', 'bad');
    const unidad = document.getElementById('miUnidad').value;
    const meta = unidad === 'seg' ? U.num(document.getElementById('miMeta').value) : U.num(document.getElementById('miMeta').value);
    const datos = { nombre: nombre, unidad: unidad, meta: meta, direccion: document.getElementById('miDir').value, peso: parseFloat(document.getElementById('miPeso').value) || 1 };
    if (id) Object.assign(App.indicador(id), datos);
    else State.indicadores.push(Object.assign({ id: U.uid('ind'), activo: true }, datos));
    await App.guardarYa();
    App.cerrarModal();
    Rend.init(); Agentes.init(); Rend.render();
    App.toast('Indicador guardado', nombre, 'ok');
  },

  async borrarIndicador(id) {
    const m = App.indicador(id); if (!m) return;
    const ok = await App.confirmar('Eliminar indicador', 'Se quita "' + m.nombre + '" del panel. Los valores ya cargados quedan guardados pero dejan de mostrarse.');
    if (!ok) return;
    State.indicadores = State.indicadores.filter(x => x.id !== id);
    await App.guardarYa();
    Rend.init(); Agentes.init(); Rend.render();
  },

  async restaurarIndicadores() {
    const ok = await App.confirmar('Restaurar indicadores sugeridos', 'Se agregan los indicadores estándar de operación que no tengas configurados. Los tuyos no se borran.');
    if (!ok) return;
    INDICADORES_BASE.forEach(b => { if (!State.indicadores.some(m => m.id === b.id)) State.indicadores.push(JSON.parse(JSON.stringify(b))); });
    await App.guardarYa();
    Rend.init(); Agentes.init(); Rend.render();
    App.toast('Indicadores restaurados', '', 'ok');
  }
};
