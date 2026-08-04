/* =========================================================================
   turnos.js — Mallas de programación
   Calcula cuántos asesores por skill quedan conectados en cada franja
   horaria según la malla cargada, descontando break y almuerzo.
   ========================================================================= */

'use strict';

const ESTADOS = {
  turno: { etiqueta: 'Turno', cuenta: true },
  descanso: { etiqueta: 'Descanso', cuenta: false },
  vacaciones: { etiqueta: 'Vacaciones', cuenta: false },
  incapacidad: { etiqueta: 'Incapacidad', cuenta: false },
  capacitacion: { etiqueta: 'Capacitación', cuenta: false },
  ausencia: { etiqueta: 'Ausencia', cuenta: false },
  permiso: { etiqueta: 'Permiso', cuenta: false }
};

/* Códigos de la columna "Novedad" tal como los entrega la malla */
const CODIGOS_NOVEDAD = {
  tur: 'turno', turno: 'turno', t: 'turno', lab: 'turno', trab: 'turno',
  des: 'descanso', dsc: 'descanso', d: 'descanso', libre: 'descanso', off: 'descanso', comp: 'descanso',
  vac: 'vacaciones', v: 'vacaciones',
  inc: 'incapacidad', lic: 'incapacidad', eps: 'incapacidad',
  cap: 'capacitacion', for: 'capacitacion', tra: 'capacitacion', ent: 'capacitacion',
  aus: 'ausencia', fal: 'ausencia', ini: 'ausencia', abn: 'ausencia',
  per: 'permiso', pnr: 'permiso', prm: 'permiso'
};

const Turnos = {

  init() {
    const f = document.getElementById('tFecha');
    if (!f.value) {
      const fechas = State.turnos.map(t => t.fecha).filter(Boolean).sort();
      f.value = fechas.length ? (fechas.indexOf(U.hoy()) > -1 ? U.hoy() : fechas[0]) : U.hoy();
    }
    Turnos.pintarSkills();
  },

  pintarSkills() {
    const sel = document.getElementById('tSkill');
    const previo = sel.value;
    sel.innerHTML = '<option value="">Todos</option>' + App.skills().map(s => '<option>' + U.esc(s) + '</option>').join('');
    sel.value = previo;
  },

  fecha() { return document.getElementById('tFecha').value || U.hoy(); },
  intervalo() { return parseInt(document.getElementById('tIntervalo').value, 10) || 30; },
  /** 'todas' descuenta cada pausa · 'almuerzo' solo la comida · 'ninguna' cuenta el turno completo */
  descontarBreaks() {
    const v = document.getElementById('tBreaks').value;
    return v === '0' ? 'ninguna' : v === '2' ? 'almuerzo' : 'todas';
  },
  skillFiltro() { return document.getElementById('tSkill').value; },

  hoy() { document.getElementById('tFecha').value = U.hoy(); Turnos.render(); },
  mover(n) { document.getElementById('tFecha').value = U.addDays(Turnos.fecha(), n); Turnos.render(); },

  /* ---------------------------- Modelo de datos -------------------------- */
  /** Turnos que aportan cobertura a una fecha (incluye los del día anterior que cruzan medianoche). */
  turnosDe(fecha) {
    const hoy = State.turnos.filter(t => t.fecha === fecha);
    const ayer = State.turnos.filter(t => t.fecha === U.addDays(fecha, -1) && t.fin > 1440);
    return { hoy: hoy, cruzados: ayer };
  },

  /** Pausas del turno (break, almuerzo, capacitación…) normalizadas a [{tipo,ini,fin}]. */
  pausasDe(t) {
    if (t.pausas && t.pausas.length) return t.pausas.filter(p => p.ini != null && p.fin != null && p.fin > p.ini);
    const out = [];
    if (t.breakIni != null && t.breakFin != null && t.breakFin > t.breakIni) out.push({ tipo: 'Break', ini: t.breakIni, fin: t.breakFin });
    if (t.almIni != null && t.almFin != null && t.almFin > t.almIni) out.push({ tipo: 'Almuerzo', ini: t.almIni, fin: t.almFin });
    return out;
  },

  /** Intervalos [inicio,fin) en minutos en los que el turno cuenta como conectado, dentro de la fecha. */
  tramos(t, esCruzado, descontar) {
    if (!ESTADOS[t.estado || 'turno'] || !ESTADOS[t.estado || 'turno'].cuenta) return [];
    if (t.ini == null || t.fin == null) return [];
    let ini = t.ini, fin = t.fin;
    if (esCruzado) { ini = 0; fin = t.fin - 1440; }
    else fin = Math.min(fin, 1440);
    if (fin <= ini) return [];

    let tramos = [[ini, fin]];
    if (descontar && descontar !== 'ninguna') {
      const lista = descontar === 'almuerzo'
        ? Turnos.pausasDe(t).filter(p => /almuerzo|lunch|comida/i.test(p.tipo))
        : Turnos.pausasDe(t);
      lista.forEach(p => {
        let a = p.ini, b = p.fin;
        if (b <= a) b += 1440;                                   // la pausa cruza medianoche
        const ajA = esCruzado ? a - 1440 : a, ajB = esCruzado ? b - 1440 : b;
        const out = [];
        tramos.forEach(([x, y]) => {
          if (ajB <= x || ajA >= y) { out.push([x, y]); return; }
          if (ajA > x) out.push([x, Math.min(ajA, y)]);
          if (ajB < y) out.push([Math.max(ajB, x), y]);
        });
        tramos = out;
      });
    }
    return tramos.filter(([a, b]) => b > a);
  },

  /** Horas efectivas del turno (descontando pausas). */
  horas(t, descontar) {
    return Turnos.tramos(t, false, descontar || 'todas').reduce((a, [i, f]) => a + (f - i), 0) / 60;
  },

  /** Matriz de cobertura: { franjas[], skills[], matriz[skill][franja], total[franja] } */
  cobertura(fecha, intervalo, skillFiltro) {
    const paso = intervalo;
    const nf = Math.floor(1440 / paso);
    const franjas = []; for (let i = 0; i < nf; i++) franjas.push(U.hhmm(i * paso));
    const { hoy, cruzados } = Turnos.turnosDe(fecha);
    const descontar = Turnos.descontarBreaks();

    const skills = [...new Set(hoy.concat(cruzados).map(t => t.skill || 'Sin skill'))]
      .filter(s => !skillFiltro || s === skillFiltro).sort((a, b) => a.localeCompare(b, 'es'));

    const matriz = {}; skills.forEach(s => matriz[s] = new Array(nf).fill(0));
    const total = new Array(nf).fill(0);

    const sumar = (t, cruzado) => {
      const s = t.skill || 'Sin skill';
      if (skillFiltro && s !== skillFiltro) return;
      if (!matriz[s]) return;
      Turnos.tramos(t, cruzado, descontar).forEach(([a, b]) => {
        for (let i = 0; i < nf; i++) {
          const medio = i * paso + paso / 2;
          if (medio >= a && medio < b) { matriz[s][i]++; total[i]++; }
        }
      });
    };
    hoy.forEach(t => sumar(t, false));
    cruzados.forEach(t => sumar(t, true));

    return { franjas: franjas, skills: skills, matriz: matriz, total: total, paso: paso };
  },

  requerido(skill, hhmm) {
    const hora = hhmm.slice(0, 2) + ':00';
    const v = State.requerido[(skill || '') + '||' + hora];
    return v == null ? null : v;
  },

  /* ------------------------------- Render -------------------------------- */
  render() {
    Turnos.pintarSkills();
    const tab = State.ui.tabs.turnos || 't-cobertura';
    if (tab === 't-cobertura') Turnos.renderCobertura();
    else if (tab === 't-malla') Turnos.renderMalla();
    else if (tab === 't-semana') Turnos.renderSemana();
    else if (tab === 't-requerido') Turnos.renderRequerido();
  },

  renderCobertura() {
    const fecha = Turnos.fecha();
    const cob = Turnos.cobertura(fecha, Turnos.intervalo(), Turnos.skillFiltro());
    const { hoy, cruzados } = Turnos.turnosDe(fecha);
    const programados = hoy.filter(t => (ESTADOS[t.estado || 'turno'] || {}).cuenta &&
      (!Turnos.skillFiltro() || (t.skill || 'Sin skill') === Turnos.skillFiltro()));
    const novedades = hoy.filter(t => !(ESTADOS[t.estado || 'turno'] || {}).cuenta);

    const modo = Turnos.descontarBreaks();
    document.getElementById('tCovSub').textContent =
      U.fechaLarga(fecha) + ' · franjas de ' + cob.paso + ' minutos · ' +
      (modo === 'todas' ? 'descontando todas las pausas' : modo === 'almuerzo' ? 'descontando solo el almuerzo' : 'turno completo');

    /* --- KPI --- */
    const pico = Math.max(0, ...cob.total);
    const iPico = cob.total.indexOf(pico);
    const activos = cob.total.filter(v => v > 0);
    const valle = activos.length ? Math.min(...activos) : 0;
    const iValle = cob.total.indexOf(valle);
    const horas = programados.reduce((a, t) => a + Turnos.tramos(t, false, Turnos.descontarBreaks()).reduce((x, [i, f]) => x + (f - i), 0), 0) / 60;

    let kpis = '';
    if (!hoy.length && !cruzados.length) {
      kpis = '<div class="kpi" style="grid-column:1/-1"><div class="kpi__label">Sin malla para esta fecha</div>' +
        '<div class="kpi__value" style="font-size:18px">No hay turnos programados el ' + U.fechaLarga(fecha) + '</div>' +
        '<div class="kpi__foot">Carga la malla desde la pestaña <strong>Cargar malla</strong> o agrega turnos manualmente.</div></div>';
    } else {
      kpis =
        '<div class="kpi kpi--hero"><div class="kpi__label">Pico de asesores conectados</div>' +
          '<div class="kpi__value">' + pico + '</div>' +
          '<div class="kpi__foot"><span>a las ' + (cob.franjas[iPico] || '—') + '</span></div></div>' +
        '<div class="kpi"><div class="kpi__label">Asesores programados</div><div class="kpi__value">' + programados.length + '</div>' +
          '<div class="kpi__foot"><span>' + cob.skills.length + ' skills</span></div></div>' +
        '<div class="kpi"><div class="kpi__label">Valle de cobertura</div><div class="kpi__value">' + valle + '</div>' +
          '<div class="kpi__foot"><span>a las ' + (cob.franjas[iValle] || '—') + '</span></div></div>' +
        '<div class="kpi"><div class="kpi__label">Horas programadas</div><div class="kpi__value">' + U.dec(horas, 1) + '</div>' +
          '<div class="kpi__foot"><span>horas-asesor del día</span></div></div>' +
        '<div class="kpi"><div class="kpi__label">Novedades</div><div class="kpi__value">' + novedades.length + '</div>' +
          '<div class="kpi__foot"><span>' + (novedades.length ? [...new Set(novedades.map(n => (ESTADOS[n.estado] || {}).etiqueta))].join(', ') : 'Sin novedades') + '</span></div></div>';
    }
    document.getElementById('tKpis').innerHTML = kpis;

    /* --- Conectados por franja --- */
    const skillSel = Turnos.skillFiltro();
    if (skillSel || cob.skills.length <= 1) {
      Chart.line('tCoverage', {
        labels: cob.franjas, series: [{ nombre: 'Conectados' + (skillSel ? ' · ' + skillSel : ''), valores: cob.total, color: Chart.css('--s1') }],
        unidad: 'num', area: true, alto: 320, tituloX: 'Franja',
        formatX: (h, largo) => largo ? 'Franja de las ' + h : h,
        vacio: 'Sin turnos programados en la fecha seleccionada'
      });
    } else {
      const orden = cob.skills.slice().sort((a, b) => Math.max(...cob.matriz[b]) - Math.max(...cob.matriz[a]));
      const principales = orden.slice(0, 6), resto = orden.slice(6);
      const series = principales.map((s, i) => ({ nombre: s, color: Chart.color(i), valores: cob.matriz[s] }));
      if (resto.length) series.push({
        nombre: 'Otros (' + resto.length + ')', color: Chart.css('--series-muted'),
        valores: cob.franjas.map((_, i) => resto.reduce((a, s) => a + cob.matriz[s][i], 0))
      });
      Chart.line('tCoverage', {
        labels: cob.franjas, series: series, unidad: 'num', alto: 320, tituloX: 'Franja',
        formatX: (h, largo) => largo ? 'Franja de las ' + h : h,
        nota: 'Cada línea es un skill. El pico total del día fue de ' + pico + ' asesores conectados.'
      });
    }

    /* --- Heatmap --- */
    Chart.heatmap('tHeat', {
      filas: cob.skills, columnas: cob.franjas, tituloFilas: 'Skill',
      valores: cob.skills.map(s => cob.matriz[s]), unidad: 'num', nombreSerie: 'Conectados',
      vacio: 'Sin turnos programados en la fecha seleccionada'
    });

    /* --- Requerido vs programado --- */
    const hayReq = Object.keys(State.requerido).length > 0;
    if (hayReq && cob.skills.length) {
      const diff = cob.franjas.map((f, i) => {
        let req = 0;
        cob.skills.forEach(s => { const r = Turnos.requerido(s, f); if (r != null) req += r; });
        return cob.total[i] - req;
      });
      const detalle = cob.franjas.map((f, i) => {
        let req = 0; cob.skills.forEach(s => { const r = Turnos.requerido(s, f); if (r != null) req += r; });
        return Chart.filaTip(null, 'Programados', cob.total[i]) + Chart.filaTip(null, 'Requeridos', req);
      });
      Chart.diverging('tGap', {
        labels: cob.franjas, valores: diff, unidad: 'num', detalle: detalle, alto: 240,
        nota: 'Define el personal necesario en la pestaña "Requerido por franja" para afinar este cálculo.'
      });
    } else {
      Chart.vacio(document.getElementById('tGap'), 'Aún no defines el personal requerido',
        'Ve a la pestaña "Requerido por franja" y escribe cuántos asesores necesitas por skill en cada hora.');
    }

    /* --- Resumen por skill --- */
    const host = document.getElementById('tSkillSummary');
    if (!cob.skills.length) { host.innerHTML = '<div class="empty">Sin skills programados en la fecha</div>'; return; }
    host.innerHTML = '<table class="data"><thead><tr><th class="no-sort">Skill</th><th class="num no-sort">Asesores</th>' +
      '<th class="num no-sort">Pico</th><th class="num no-sort">Hora pico</th><th class="num no-sort">Valle</th>' +
      '<th class="num no-sort">Promedio</th><th class="num no-sort">Horas programadas</th></tr></thead><tbody>' +
      cob.skills.map(s => {
        const v = cob.matriz[s];
        const pk = Math.max(...v), ipk = v.indexOf(pk);
        const act = v.filter(x => x > 0);
        const ase = new Set(hoy.filter(t => (t.skill || 'Sin skill') === s && (ESTADOS[t.estado || 'turno'] || {}).cuenta).map(t => t.agente)).size;
        const hs = v.reduce((a, x) => a + x, 0) * cob.paso / 60;
        return '<tr><td class="name">' + U.esc(s) + '</td><td class="num">' + ase + '</td><td class="num"><strong>' + pk + '</strong></td>' +
          '<td class="num">' + (cob.franjas[ipk] || '—') + '</td><td class="num">' + (act.length ? Math.min(...act) : 0) + '</td>' +
          '<td class="num">' + U.dec(act.length ? U.prom(act) : 0, 1) + '</td><td class="num">' + U.dec(hs, 1) + '</td></tr>';
      }).join('') + '</tbody></table>';
  },

  /* ------------------------------ Malla del día -------------------------- */
  renderMalla() {
    const fecha = Turnos.fecha();
    const skillSel = Turnos.skillFiltro();
    const lista = State.turnos.filter(t => t.fecha === fecha && (!skillSel || (t.skill || 'Sin skill') === skillSel))
      .sort((a, b) => (a.ini == null ? 9999 : a.ini) - (b.ini == null ? 9999 : b.ini) || a.agente.localeCompare(b.agente, 'es'));

    document.getElementById('tMallaSub').textContent = U.fechaLarga(fecha) + ' · ' + lista.length + ' registros';

    /* Gantt */
    const host = document.getElementById('tGantt');
    if (!lista.length) {
      host.innerHTML = '<div class="empty"><strong>Sin turnos en esta fecha</strong>Carga la malla o agrega un turno manualmente.</div>';
    } else {
      const conHora = lista.filter(t => t.ini != null && t.fin != null);
      const min = conHora.length ? Math.floor(Math.min(...conHora.map(t => t.ini)) / 60) * 60 : 0;
      const max = conHora.length ? Math.ceil(Math.max(...conHora.map(t => t.fin)) / 60) * 60 : 1440;
      const span = Math.max(60, max - min);
      const pos = m => ((m - min) / span) * 100;

      const ticks = [];
      const pasoTick = span > 900 ? 120 : 60;
      for (let m = min; m <= max; m += pasoTick) ticks.push(m);

      host.innerHTML = '<div class="gantt__inner">' +
        '<div class="gantt__scale"><div></div><div class="gantt__ticks">' +
          ticks.map(m => '<span class="gantt__tick" style="left:' + pos(m).toFixed(2) + '%">' + U.hhmm(m) + '</span>').join('') +
        '</div></div>' +
        lista.map(t => {
          const est = ESTADOS[t.estado || 'turno'] || ESTADOS.turno;
          if (!est.cuenta || t.ini == null) {
            return '<div class="gantt__row"><div class="gantt__label">' + U.esc(t.agente) + '<small>' + U.esc(t.skill || '') + '</small></div>' +
              '<div class="gantt__track"><span class="gantt__off">' + est.etiqueta + '</span></div></div>';
          }
          const idx = App.skills().indexOf(t.skill);
          const color = Chart.color(idx < 0 ? 0 : idx);
          const breaks = Turnos.pausasDe(t);
          return '<div class="gantt__row"><div class="gantt__label">' + U.esc(t.agente) + '<small>' + U.esc(t.skill || 'Sin skill') + '</small></div>' +
            '<div class="gantt__track">' +
              '<div class="gantt__bar" style="left:' + pos(t.ini).toFixed(2) + '%;width:' + ((t.fin - t.ini) / span * 100).toFixed(2) + '%;background:' + color + '" ' +
              'title="' + U.hhmm(t.ini) + ' a ' + U.hhmm(t.fin) + '"></div>' +
              breaks.map(p => '<div class="gantt__break" style="left:' + pos(p.ini).toFixed(2) + '%;width:' + ((p.fin - p.ini) / span * 100).toFixed(2) +
                '%" title="' + U.esc(p.tipo) + ' ' + U.hhmm(p.ini) + '-' + U.hhmm(p.fin) + '"></div>').join('') +
            '</div></div>';
        }).join('') + '</div>';
    }

    /* Tabla */
    const tabla = document.getElementById('tTable');
    if (!lista.length) { tabla.innerHTML = '<div class="empty">Sin turnos</div>'; return; }
    tabla.innerHTML = '<table class="data"><thead><tr><th class="no-sort">Agente</th><th class="no-sort">Documento</th><th class="no-sort">Skill</th>' +
      '<th class="no-sort">Novedad</th><th class="no-sort">Entrada</th><th class="no-sort">Salida</th><th class="no-sort">Pausas</th>' +
      '<th class="num no-sort">Horas efectivas</th><th class="no-sort"></th></tr></thead><tbody>' +
      lista.map(t => {
        const est = ESTADOS[t.estado || 'turno'] || ESTADOS.turno;
        const ps = Turnos.pausasDe(t);
        return '<tr><td class="name">' + U.esc(t.agente) + '</td><td>' + U.esc(t.doc || '—') + '</td><td>' + U.esc(t.skill || '—') + '</td>' +
          '<td><span class="badge ' + (est.cuenta ? 'badge--info' : 'badge--warn') + '">' + est.etiqueta + '</span></td>' +
          '<td>' + (t.ini == null ? '—' : U.hhmm(t.ini)) + '</td>' +
          '<td>' + (t.fin == null ? '—' : U.hhmm(t.fin) + (t.fin > 1440 ? ' (+1d)' : '')) + '</td>' +
          '<td>' + (ps.length ? ps.map(p => U.esc(p.tipo) + ' ' + U.hhmm(p.ini) + '–' + U.hhmm(p.fin)).join(' · ') : '—') + '</td>' +
          '<td class="num">' + (est.cuenta ? U.dec(Turnos.horas(t), 1) : '—') + '</td>' +
          '<td><button class="icon-btn" type="button" title="Editar" onclick="Turnos.editar(\'' + t.id + '\')">✎</button> ' +
              '<button class="icon-btn icon-btn--danger" type="button" title="Eliminar" onclick="Turnos.borrar(\'' + t.id + '\')">✕</button></td></tr>';
      }).join('') + '</tbody></table>';
  },

  /* ------------------------------ Semana --------------------------------- */
  renderSemana() {
    const ini = U.inicioSemana(Turnos.fecha());
    const dias = []; for (let i = 0; i < 7; i++) dias.push(U.addDays(ini, i));
    const skillSel = Turnos.skillFiltro();

    const cuenta = dias.map(d => State.turnos.filter(t => t.fecha === d && (ESTADOS[t.estado || 'turno'] || {}).cuenta &&
      (!skillSel || (t.skill || 'Sin skill') === skillSel)).length);

    Chart.bars('tWeek', {
      labels: dias.map(d => U.diaSemana(d) + ' ' + d.slice(8)), valores: cuenta, unidad: 'num',
      horizontal: false, alto: 250, color: Chart.css('--s1'), nombreSerie: 'Asesores programados',
      nota: 'Semana del ' + U.fechaCorta(ini) + ' al ' + U.fechaCorta(dias[6]) + '.'
    });

    const agentes = [...new Set(State.turnos.filter(t => dias.indexOf(t.fecha) > -1 &&
      (!skillSel || (t.skill || 'Sin skill') === skillSel)).map(t => t.agente))].sort((a, b) => a.localeCompare(b, 'es'));
    const host = document.getElementById('tWeekTable');
    if (!agentes.length) { host.innerHTML = '<div class="empty"><strong>Sin malla en esta semana</strong>Carga la malla para ver el cuadro semanal.</div>'; return; }

    host.innerHTML = '<table class="data"><thead><tr><th class="no-sort">Agente</th>' +
      dias.map(d => '<th class="no-sort">' + U.diaSemana(d) + ' ' + d.slice(8) + '</th>').join('') +
      '<th class="num no-sort">Horas</th></tr></thead><tbody>' +
      agentes.map(a => {
        let horas = 0;
        const celdas = dias.map(d => {
          const t = State.turnos.find(x => x.fecha === d && x.agente === a && (!skillSel || (x.skill || 'Sin skill') === skillSel));
          if (!t) return '<td style="color:var(--ink-muted)">—</td>';
          const est = ESTADOS[t.estado || 'turno'] || ESTADOS.turno;
          if (!est.cuenta) return '<td><span class="badge badge--warn">' + est.etiqueta + '</span></td>';
          horas += Turnos.horas(t);
          return '<td>' + U.hhmm(t.ini) + '–' + U.hhmm(t.fin) + '</td>';
        }).join('');
        return '<tr><td class="name">' + U.esc(a) + '</td>' + celdas + '<td class="num"><strong>' + U.dec(horas, 1) + '</strong></td></tr>';
      }).join('') + '</tbody></table>';
  },

  /* ----------------------------- Requerido ------------------------------- */
  renderRequerido() {
    const skills = App.skills();
    const host = document.getElementById('tReqTable');
    if (!skills.length) {
      host.innerHTML = '<div class="empty"><strong>Todavía no hay skills</strong>Carga una malla o registros de rendimiento para que aparezcan los skills.</div>';
      return;
    }
    const horas = []; for (let h = 0; h < 24; h++) horas.push(U.hhmm(h * 60));
    host.innerHTML = '<table class="data"><thead><tr><th class="no-sort">Hora</th>' +
      skills.map(s => '<th class="num no-sort">' + U.esc(s) + '</th>').join('') + '<th class="num no-sort">Total</th></tr></thead><tbody>' +
      horas.map(h => {
        let total = 0;
        const celdas = skills.map(s => {
          const v = State.requerido[s + '||' + h];
          if (v != null) total += v;
          return '<td class="num"><input type="number" min="0" step="1" style="width:66px;padding:4px 6px;text-align:right" ' +
            'value="' + (v == null ? '' : v) + '" onchange="Turnos.setRequerido(\'' + U.js(s) + '\',\'' + h + '\',this.value)"></td>';
        }).join('');
        return '<tr><td class="name">' + h + '</td>' + celdas + '<td class="num"><strong>' + (total || '—') + '</strong></td></tr>';
      }).join('') + '</tbody></table>';
  },

  setRequerido(skill, hora, valor) {
    const v = parseInt(valor, 10);
    if (isNaN(v) || v < 0) delete State.requerido[skill + '||' + hora];
    else State.requerido[skill + '||' + hora] = v;
    App.guardar();
  },

  autollenarRequerido() {
    const cob = Turnos.cobertura(Turnos.fecha(), 60, '');
    if (!cob.skills.length) return App.toast('Sin malla en la fecha', 'Selecciona un día con turnos programados.', 'bad');
    cob.skills.forEach(s => cob.franjas.forEach((f, i) => {
      if (cob.matriz[s][i] > 0) State.requerido[s + '||' + f] = cob.matriz[s][i];
    }));
    App.guardarYa().then(() => { Turnos.renderRequerido(); App.toast('Requerido cargado', 'Se usó la programación del ' + U.fechaCorta(Turnos.fecha()) + ' como base. Ajústalo según tu pronóstico.', 'ok'); });
  },

  async limpiarRequerido() {
    const ok = await App.confirmar('Limpiar requerido', 'Se borran todos los valores de personal requerido.');
    if (!ok) return;
    State.requerido = {};
    await App.guardarYa();
    Turnos.renderRequerido();
  },

  /* --------------------------- Alta y edición ---------------------------- */
  nuevoTurno() {
    document.getElementById('sFecha').value = Turnos.fecha();
    App.tab('turnos', 't-carga');
    setTimeout(() => document.getElementById('sAgente').focus(), 120);
  },

  pausaDe(tipo, idIni, idFin, minutosPorDefecto) {
    const a = U.minutos(document.getElementById(idIni).value);
    let b = U.minutos(document.getElementById(idFin).value);
    if (a == null) return null;
    if (b == null) b = a + minutosPorDefecto;
    if (b === a) return null;
    if (b < a) b += 1440;
    return { tipo: tipo, ini: a, fin: b };
  },

  async guardarManual(ev) {
    ev.preventDefault();
    const t = {
      id: U.uid('trn'),
      fecha: document.getElementById('sFecha').value,
      agente: document.getElementById('sAgente').value.trim(),
      skill: document.getElementById('sSkill').value.trim(),
      estado: document.getElementById('sEstado').value,
      ini: U.minutos(document.getElementById('sEntrada').value),
      fin: U.minutos(document.getElementById('sSalida').value),
      pausas: [Turnos.pausaDe('Break', 'sBreakIni', 'sBreakFin', 15), Turnos.pausaDe('Almuerzo', 'sAlmIni', 'sAlmFin', 60)].filter(Boolean)
    };
    if (!t.fecha || !t.agente) return;
    if (t.ini != null && t.fin != null && t.ini === t.fin) { t.ini = null; t.fin = null; }
    if (t.fin != null && t.ini != null && t.fin < t.ini) t.fin += 1440;      // cruza medianoche

    const prev = State.turnos.find(x => x.fecha === t.fecha && U.norm(x.agente) === U.norm(t.agente) && x.skill === t.skill);
    if (prev) Object.assign(prev, t, { id: prev.id });
    else State.turnos.push(t);

    await App.guardarYa();
    Turnos.init(); Agentes.init(); Rend.pintarDatalists();
    document.getElementById('tFecha').value = t.fecha;
    App.tab('turnos', 't-malla');
    App.toast(prev ? 'Turno actualizado' : 'Turno agregado', t.agente + ' · ' + U.fechaCorta(t.fecha), 'ok');
  },

  editar(id) {
    const t = State.turnos.find(x => x.id === id);
    if (!t) return;
    const hora = v => v == null ? '' : U.hhmm(v);
    const ps = Turnos.pausasDe(t);
    App.modal({
      titulo: 'Editar turno · ' + t.agente,
      cuerpo: '<div class="form-grid">' +
        '<div class="field"><label>Agente</label><input type="text" id="etAgente" value="' + U.esc(t.agente) + '"></div>' +
        '<div class="field"><label>Documento</label><input type="text" id="etDoc" value="' + U.esc(t.doc || '') + '"></div>' +
        '<div class="field"><label>Skill / Servicio</label><input type="text" id="etSkill" value="' + U.esc(t.skill || '') + '"></div>' +
        '<div class="field"><label>Novedad</label><select id="etEstado">' +
          Object.keys(ESTADOS).map(k => '<option value="' + k + '"' + ((t.estado || 'turno') === k ? ' selected' : '') + '>' + ESTADOS[k].etiqueta + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>Entrada</label><input type="time" id="etIni" value="' + hora(t.ini) + '"></div>' +
        '<div class="field"><label>Salida</label><input type="time" id="etFin" value="' + hora(t.fin) + '"></div>' +
        '</div>' +
        '<p class="hint" style="margin:14px 0 6px"><strong>Pausas</strong> (se descuentan de la cobertura)</p>' +
        '<div id="etPausas">' +
          (ps.length ? ps.map((p, i) => Turnos.filaPausaHTML(p, i)).join('') : '') +
        '</div>' +
        '<button class="btn btn--ghost btn--sm" type="button" onclick="Turnos.agregarFilaPausa()" style="margin-top:8px">+ Agregar pausa</button>',
      pie: '<button class="btn btn--ghost" type="button" onclick="App.cerrarModal()">Cancelar</button>' +
           '<button class="btn btn--primary" type="button" onclick="Turnos.guardarEdicion(\'' + id + '\')">Guardar</button>'
    });
  },

  filaPausaHTML(p, i) {
    return '<div class="form-grid" data-pausa style="margin-bottom:8px;align-items:end">' +
      '<div class="field"><label>Tipo</label><input type="text" data-p="tipo" value="' + U.esc(p ? p.tipo : '') + '" placeholder="Break, Almuerzo…"></div>' +
      '<div class="field"><label>Inicio</label><input type="time" data-p="ini" value="' + (p ? U.hhmm(p.ini) : '') + '"></div>' +
      '<div class="field"><label>Fin</label><input type="time" data-p="fin" value="' + (p ? U.hhmm(p.fin) : '') + '"></div>' +
      '<div class="field"><label>&nbsp;</label><button class="icon-btn icon-btn--danger" type="button" onclick="this.closest(\'[data-pausa]\').remove()">✕</button></div>' +
      '</div>';
  },

  agregarFilaPausa() {
    document.getElementById('etPausas').insertAdjacentHTML('beforeend', Turnos.filaPausaHTML(null, 0));
  },

  async guardarEdicion(id) {
    const t = State.turnos.find(x => x.id === id);
    if (!t) return;
    t.agente = document.getElementById('etAgente').value.trim() || t.agente;
    t.doc = document.getElementById('etDoc').value.trim();
    t.skill = document.getElementById('etSkill').value.trim();
    t.estado = document.getElementById('etEstado').value;
    t.ini = U.minutos(document.getElementById('etIni').value);
    t.fin = U.minutos(document.getElementById('etFin').value);
    if (t.ini != null && t.fin != null && t.ini === t.fin) { t.ini = null; t.fin = null; }
    if (t.fin != null && t.ini != null && t.fin < t.ini) t.fin += 1440;

    t.pausas = [...document.querySelectorAll('#etPausas [data-pausa]')].map(fila => {
      const g = k => fila.querySelector('[data-p="' + k + '"]').value;
      const a = U.minutos(g('ini'));
      let b = U.minutos(g('fin'));
      if (a == null || b == null || a === b) return null;
      if (b < a) b += 1440;
      return { tipo: g('tipo').trim() || 'Pausa', ini: a, fin: b };
    }).filter(Boolean);
    delete t.breakIni; delete t.breakFin; delete t.almIni; delete t.almFin;

    await App.guardarYa();
    App.cerrarModal();
    Turnos.render();
    App.toast('Turno actualizado', '', 'ok');
  },

  async borrar(id) {
    State.turnos = State.turnos.filter(t => t.id !== id);
    await App.guardarYa();
    Turnos.render();
  },

  async borrarTodo() {
    const ok = await App.confirmar('Borrar la malla', 'Se eliminan los ' + State.turnos.length + ' turnos cargados.');
    if (!ok) return;
    State.turnos = [];
    await App.guardarYa();
    Turnos.render();
    App.toast('Malla eliminada', '', 'ok');
  },

  /* ---------------------------- Carga de malla --------------------------- */
  onDrop(ev) {
    ev.preventDefault(); ev.currentTarget.classList.remove('is-over');
    const f = ev.dataTransfer.files[0]; if (f) Turnos.procesar(f);
  },
  onFile(ev) { const f = ev.target.files[0]; if (f) Turnos.procesar(f); ev.target.value = ''; },

  async procesar(file) {
    try {
      const libro = await Sheets.leer(file);
      Turnos.directorio = Turnos.leerDirectorio(libro);      // cruce documento → nombre (hoja de planta)

      Mapper.abrir({
        host: 'turnosMapper', libro: libro, filtroFechas: true,
        campos: [
          { key: 'fecha', label: 'Fecha', req: true, alias: ['dia', 'día', 'date'] },
          { key: 'agente', label: 'Agente', alias: ['nombre agente', 'nombre_agente', 'asesor', 'nombre', 'nombre completo', 'nombre_completo', 'empleado', 'colaborador'],
            ayuda: 'Si tu malla solo trae el documento, el nombre se completa con la hoja de planta.' },
          { key: 'doc', label: 'Documento', alias: ['documento', 'cedula', 'cédula', 'identificacion', 'cc', 'id'] },
          { key: 'skill', label: 'Skill / Servicio', alias: ['servicio', 'campaña', 'campana', 'cola', 'grupo', 'linea', 'línea', 'skill'] },
          { key: 'estado', label: 'Novedad', alias: ['novedad', 'estado', 'tipo', 'observacion'],
            ayuda: 'TUR = turno, DES = descanso, VAC, INC, CAP, AUS…' },
          { key: 'ini', label: 'Hora de entrada', req: true, alias: ['turno ini', 'turno_ini', 'entrada', 'inicio', 'hora inicio', 'ingreso', 'desde', 'login'] },
          { key: 'fin', label: 'Hora de salida', req: true, alias: ['turno fin', 'turno_fin', 'salida', 'fin', 'hora fin', 'hasta', 'logout'] },
          { key: 'horasRef', label: 'Horas laboradas', alias: ['horas laboradas', 'horas_laboradas', 'horas', 'jornada'],
            ayuda: 'Solo informativo: el panel recalcula las horas.' }
        ],
        camposDe: Turnos.camposPausas,
        extra: '<label class="checkline" style="margin-top:6px"><input type="checkbox" data-opcion="reemplazar" checked> Reemplazar la malla existente de los días que se importan</label>' +
               (Turnos.directorio && Turnos.directorio.total
                 ? '<p class="hint" style="margin-top:6px">Se detectó una hoja de planta con ' + Turnos.directorio.total +
                   ' personas: se usará para completar el nombre y el servicio a partir del documento.</p>' : ''),
        onImportar: Turnos.importar
      });
    } catch (e) {
      App.toast('No se pudo leer el archivo', e.message || 'Formato no reconocido', 'bad');
    }
  },

  /** Detecta pares de columnas <Pausa>_Ini / <Pausa>_Fin (Des_1, Des_2, Lunch, Training…). */
  camposPausas(cabeceras) {
    const campos = [];
    const vistos = {};
    cabeceras.forEach((h, i) => {
      const m = String(h).match(/^(.*?)[ _-]*(ini|inicio|start)$/i);
      if (!m) return;
      const base = m[1].replace(/[ _-]+$/, '');
      const nb = U.norm(base);
      if (!nb || nb === 'turno' || nb === 'fecha' || vistos[nb]) return;
      // Busca la columna de fin correspondiente
      const fin = cabeceras.findIndex(h2 => {
        const m2 = String(h2).match(/^(.*?)[ _-]*(fin|final|end)$/i);
        return m2 && U.norm(m2[1].replace(/[ _-]+$/, '')) === nb;
      });
      if (fin < 0) return;
      vistos[nb] = true;
      const etiqueta = Turnos.nombrePausa(base);
      campos.push({ key: 'pausa:' + nb + ':ini', label: etiqueta + ' — inicio', alias: [String(h)] });
      campos.push({ key: 'pausa:' + nb + ':fin', label: etiqueta + ' — fin', alias: [String(cabeceras[fin])] });
    });
    return campos;
  },

  nombrePausa(base) {
    const n = U.norm(base);
    if (/^des ?(\d*)$/.test(n)) return 'Break ' + (n.replace(/\D/g, '') || '');
    if (/lunch|almuerzo|comida/.test(n)) return 'Almuerzo';
    if (/train|capacit|formacion/.test(n)) return 'Capacitación ' + (n.replace(/\D/g, '') || '');
    if (/lac/.test(n)) return 'Lactancia';
    if (/dialog|briefing|reunion/.test(n)) return 'Reunión';
    return base.replace(/_/g, ' ');
  },

  /** Busca en el libro una hoja de planta para cruzar documento → nombre y servicio. */
  leerDirectorio(libro) {
    const dir = { nombre: {}, skill: {}, total: 0 };
    libro.hojas.forEach(h => {
      const cab = (h.filas[0] || []).map(U.norm);
      const cDoc = cab.findIndex(c => /^(cedula|documento|identificacion|cc|doc)$/.test(c));
      const cNom = cab.findIndex(c => /^(nombre completo|nombre agente|nombre|nombres|nombre asesor)$/.test(c));
      if (cDoc < 0 || cNom < 0) return;
      const cSkill = cab.findIndex(c => /^(servicio|skill|campana|campaña|cola)$/.test(c));
      h.filas.slice(1).forEach(f => {
        const d = String(f[cDoc] == null ? '' : f[cDoc]).trim();
        const n = String(f[cNom] == null ? '' : f[cNom]).trim();
        if (!d || !n || dir.nombre[d]) return;
        dir.nombre[d] = n;
        if (cSkill > -1 && f[cSkill]) dir.skill[d] = String(f[cSkill]).trim();
        dir.total++;
      });
    });
    return dir;
  },

  detectarEstado(txt) {
    const n = U.norm(txt);
    if (!n) return 'turno';
    if (CODIGOS_NOVEDAD[n]) return CODIGOS_NOVEDAD[n];
    const primera = n.split(' ')[0];
    if (CODIGOS_NOVEDAD[primera]) return CODIGOS_NOVEDAD[primera];
    if (/descans|libre|dia libre|off|compensator/.test(n)) return 'descanso';
    if (/vacacion/.test(n)) return 'vacaciones';
    if (/incapacid|licencia|medic/.test(n)) return 'incapacidad';
    if (/capacit|formacion|entrenamiento|training/.test(n)) return 'capacitacion';
    if (/ausen|falta|no show|abandono/.test(n)) return 'ausencia';
    if (/permiso/.test(n)) return 'permiso';
    return 'turno';
  },

  async importar(mapeo, filas, opciones) {
    const dir = Turnos.directorio || { nombre: {}, skill: {} };
    const permitidas = opciones.fechas ? new Set(opciones.fechas) : null;

    // Pausas presentes en el mapeo
    const pausas = [];
    Object.keys(mapeo).forEach(k => {
      const m = k.match(/^pausa:(.+):ini$/);
      if (m && mapeo['pausa:' + m[1] + ':fin'] != null) {
        pausas.push({ clave: m[1], ini: mapeo[k], fin: mapeo['pausa:' + m[1] + ':fin'] });
      }
    });

    const nuevos = [];
    let saltadas = 0, fueraDeRango = 0;
    filas.forEach(f => {
      const fecha = U.parseFecha(f[mapeo.fecha]);
      if (!fecha) { saltadas++; return; }
      if (permitidas && !permitidas.has(fecha)) { fueraDeRango++; return; }

      const doc = mapeo.doc != null ? String(f[mapeo.doc] == null ? '' : f[mapeo.doc]).trim() : '';
      let agente = mapeo.agente != null ? String(f[mapeo.agente] == null ? '' : f[mapeo.agente]).trim() : '';
      if (!agente && doc) agente = dir.nombre[doc] || ('Documento ' + doc);
      if (!agente) { saltadas++; return; }

      const estado = mapeo.estado != null ? Turnos.detectarEstado(f[mapeo.estado]) : 'turno';
      let ini = U.minutos(f[mapeo.ini]), fin = U.minutos(f[mapeo.fin]);
      // 00:00 – 00:00 significa "sin horario" (día de descanso o campo vacío)
      if (ini != null && fin != null && ini === fin) { ini = null; fin = null; }
      if (estado === 'turno' && (ini == null || fin == null)) { saltadas++; return; }
      if (ini != null && fin != null && fin < ini) fin += 1440;      // cruza medianoche

      let skill = mapeo.skill != null ? String(f[mapeo.skill] == null ? '' : f[mapeo.skill]).trim() : '';
      if (!skill && doc && dir.skill[doc]) skill = dir.skill[doc];

      const lista = [];
      pausas.forEach(p => {
        let a = U.minutos(f[p.ini]), b = U.minutos(f[p.fin]);
        if (a == null || b == null) return;
        if (a === b) return;                                        // 00:00–00:00 = pausa no asignada
        if (b < a) b += 1440;
        lista.push({ tipo: Turnos.nombrePausa(p.clave), ini: a, fin: b });
      });

      nuevos.push({
        id: U.uid('trn'), fecha: fecha, agente: agente, doc: doc, skill: skill, estado: estado,
        ini: ini, fin: fin, pausas: lista,
        horasRef: mapeo.horasRef != null ? U.minutos(f[mapeo.horasRef]) : null
      });
    });

    if (!nuevos.length) {
      App.toast('No se importó ningún turno',
        saltadas ? 'Revisa las columnas de fecha, agente y horas.' : 'Ningún día seleccionado tiene filas.', 'bad');
      return;
    }
    if (opciones.reemplazar) {
      const fechas = new Set(nuevos.map(t => t.fecha));
      State.turnos = State.turnos.filter(t => !fechas.has(t.fecha));
    }
    State.turnos = State.turnos.concat(nuevos);

    await App.guardarYa();
    Mapper.cerrar();
    const fechas = [...new Set(nuevos.map(t => t.fecha))].sort();
    document.getElementById('tFecha').value = fechas.indexOf(U.hoy()) > -1 ? U.hoy() : fechas[0];
    Turnos.init(); Agentes.init(); Rend.pintarDatalists();
    App.tab('turnos', 't-cobertura');
    App.toast('Malla importada',
      nuevos.length + ' turnos · ' + fechas.length + ' día(s): ' + fechas.map(U.fechaCorta).join(', ') +
      (fueraDeRango ? ' · ' + fueraDeRango + ' filas de días no seleccionados' : '') +
      (saltadas ? ' · ' + saltadas + ' filas sin datos' : ''), 'ok');
  },

  plantilla() {
    const filas = [['Fecha', 'Documento', 'Nombre Agente', 'Servicio', 'Novedad', 'Horas_Laboradas',
      'Turno_Ini', 'Turno_Fin', 'Des_1_Ini', 'Des_1_Fin', 'Des_2_Ini', 'Des_2_Fin', 'Lunch_Ini', 'Lunch_Fin']];
    filas.push(['2026-08-08', '1032940824', 'CARDOZO DAZA ANDRES', 'INB', 'TUR', '07:00', '05:00', '12:00', '07:25', '07:40', '10:45', '11:00', '00:00', '00:00']);
    filas.push(['2026-08-08', '1006507935', 'MONTALVO COLLAZOS KATERINE', 'CHAT', 'TUR', '07:00', '06:00', '13:00', '07:45', '08:00', '11:00', '11:15', '00:00', '00:00']);
    filas.push(['2026-08-08', '1013681738', 'NEIRA MANRIQUE SERGIO', 'EMAIL', 'TUR', '08:20', '07:40', '17:00', '10:30', '10:45', '15:45', '16:00', '13:00', '14:00']);
    filas.push(['2026-08-08', '1020715756', 'NARANJO GALINDO BRALLAN', 'OUT', 'DES', '00:00', '00:00', '00:00', '00:00', '00:00', '00:00', '00:00', '00:00', '00:00']);
    U.descargar('plantilla-malla-turnos.csv', U.csv(filas), 'text/csv');
    App.toast('Plantilla descargada', 'Usa los mismos nombres de columna de tu malla.', 'ok');
  },

  exportarMalla() {
    const fecha = Turnos.fecha();
    const lista = State.turnos.filter(t => t.fecha === fecha);
    if (!lista.length) return App.toast('Nada que exportar', 'No hay turnos en la fecha seleccionada.', 'bad');
    const maxP = Math.max(0, ...lista.map(t => Turnos.pausasDe(t).length));
    const cab = ['Fecha', 'Documento', 'Nombre Agente', 'Servicio', 'Novedad', 'Turno_Ini', 'Turno_Fin'];
    for (let i = 0; i < maxP; i++) cab.push('Pausa_' + (i + 1), 'Pausa_' + (i + 1) + '_Ini', 'Pausa_' + (i + 1) + '_Fin');
    cab.push('Horas_Efectivas');
    const filas = [cab];
    lista.forEach(t => {
      const fila = [t.fecha, t.doc || '', t.agente, t.skill || '', (ESTADOS[t.estado || 'turno'] || {}).etiqueta,
        t.ini == null ? '' : U.hhmm(t.ini), t.fin == null ? '' : U.hhmm(t.fin)];
      const ps = Turnos.pausasDe(t);
      for (let i = 0; i < maxP; i++) {
        const p = ps[i];
        fila.push(p ? p.tipo : '', p ? U.hhmm(p.ini) : '', p ? U.hhmm(p.fin) : '');
      }
      fila.push(String(Turnos.horas(t).toFixed(2)).replace('.', ','));
      filas.push(fila);
    });
    U.descargar('malla-' + fecha + '.csv', U.csv(filas), 'text/csv');
  }
};
