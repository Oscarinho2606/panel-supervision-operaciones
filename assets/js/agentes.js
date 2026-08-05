/* =========================================================================
   agentes.js — Seguimiento individual
   Cada agente que el supervisor agrega al tablero obtiene su propio gráfico.
   Además: ficha completa (un gráfico por indicador) y comparativa.
   ========================================================================= */

'use strict';

const Agentes = {

  init() {
    const sel = document.getElementById('aMetric');
    const inds = App.indicadoresActivos();
    const previo = sel.value;
    sel.innerHTML = inds.map(m => '<option value="' + m.id + '">' + U.esc(m.nombre) + '</option>').join('');
    // Si el indicador que estaba elegido no tiene datos, se pasa a uno que sí
    if (previo && inds.some(m => m.id === previo) && App.tieneDatos(previo)) sel.value = previo;
    else { const d = App.primerIndicadorConDatos(); if (d) sel.value = d.id; }

    Agentes.pintarSkills();

    const r = App.rangoDatos(State.registros);
    if (!document.getElementById('aDesde').value) document.getElementById('aDesde').value = r.min;
    if (!document.getElementById('aHasta').value) document.getElementById('aHasta').value = r.max;

    // Si nunca ha elegido, arranca con los primeros 6 agentes disponibles
    if (!State.ui.agentesSel || !State.ui.agentesSel.length) {
      State.ui.agentesSel = App.agentes().slice(0, 6).map(a => a.nombre);
    }
    Agentes.pintarFichaSel();
  },

  /* -------------------------------- Skill -------------------------------- */
  pintarSkills() {
    const sel = document.getElementById('aSkill');
    if (!sel) return;
    const previo = sel.value;
    const skills = App.skills();
    sel.innerHTML = '<option value="">Todos (agrupados por skill)</option>' +
      skills.map(s => '<option value="' + U.esc(s) + '">' + U.esc(s) + '</option>').join('');
    if (previo && skills.indexOf(previo) > -1) sel.value = previo;
  },

  skillFiltro() {
    const sel = document.getElementById('aSkill');
    return sel ? sel.value : '';
  },

  /** Agentes que trabajan el skill filtrado, según la malla de turnos. */
  agentesDelSkill() {
    const sk = Agentes.skillFiltro();
    if (!sk) return App.agentes();
    return App.agentes().filter(a => App.skillsDeAgente(a.nombre).indexOf(sk) > -1);
  },

  /** Skill del agente: el segmento en el que está programado en la malla. */
  skillPrincipal(nombre) { return App.skillDeAgente(nombre); },

  onSkill() {
    // Al cambiar de skill, deja en el tablero solo los agentes que pertenecen a él
    const sk = Agentes.skillFiltro();
    if (sk) {
      const validos = new Set(Agentes.agentesDelSkill().map(a => a.nombre));
      const quedan = (State.ui.agentesSel || []).filter(n => validos.has(n));
      State.ui.agentesSel = quedan.length ? quedan : [...validos].slice(0, 12);
    }
    App.guardar();
    Agentes.render();
  },

  /* ------------------------------ Selector ------------------------------- */
  renderPicker() {
    const host = document.getElementById('aPicker');
    const b = U.norm(document.getElementById('aBuscar').value || '');
    const todos = Agentes.agentesDelSkill();
    const lista = b ? todos.filter(a => U.norm(a.nombre + ' ' + a.doc).indexOf(b) > -1) : todos;

    if (!App.agentes().length) {
      host.innerHTML = '<div class="empty" style="padding:18px"><strong>Todavía no hay agentes</strong>Carga registros de rendimiento o una malla de turnos para que aparezcan aquí.</div>';
      return;
    }
    if (!todos.length) {
      host.innerHTML = '<div class="empty" style="padding:18px"><strong>Ningún agente en «' + U.esc(Agentes.skillFiltro()) + '»</strong>' +
        'Cambia el skill o selecciona «Todos».</div>';
      return;
    }
    const sel = new Set(State.ui.agentesSel || []);
    host.innerHTML = lista.map(a => {
      const on = sel.has(a.nombre);
      return '<button type="button" class="agent-chip' + (on ? ' is-on' : '') + '" onclick="Agentes.toggle(\'' +
        U.js(a.nombre) + '\')" title="' + U.esc(a.skills.join(', ')) + '">' +
        '<span class="agent-chip__box">✓</span>' + U.esc(a.nombre) + '</button>';
    }).join('') || '<div class="empty" style="padding:14px">Ningún agente coincide con la búsqueda</div>';
  },

  toggle(nombre) {
    const sel = new Set(State.ui.agentesSel || []);
    if (sel.has(nombre)) sel.delete(nombre); else sel.add(nombre);
    State.ui.agentesSel = [...sel];
    App.guardar();
    Agentes.render();
  },

  seleccionarTodos() {
    // Agrega los que están visibles con el skill filtrado, sin quitar los demás
    const nuevos = Agentes.agentesDelSkill().map(a => a.nombre);
    State.ui.agentesSel = [...new Set((State.ui.agentesSel || []).concat(nuevos))];
    App.guardar(); Agentes.render();
  },
  limpiarSeleccion() {
    State.ui.agentesSel = [];
    App.guardar(); Agentes.render();
  },

  pintarFichaSel() {
    const sel = document.getElementById('aFichaSel');
    if (!sel) return;
    const previo = sel.value;
    const lista = Agentes.agentesDelSkill();
    sel.innerHTML = lista.map(a => '<option value="' + U.esc(a.nombre) + '">' + U.esc(a.nombre) +
      ' — ' + U.esc(App.skillDeAgente(a.nombre)) + '</option>').join('');
    if (previo && lista.some(a => a.nombre === previo)) sel.value = previo;
  },

  /* ------------------------------- Datos --------------------------------- */
  rango() {
    return { desde: document.getElementById('aDesde').value, hasta: document.getElementById('aHasta').value };
  },

  /**
   * Registros del agente en el periodo. Si hay un skill filtrado y sus registros
   * traen skill, se toman solo los de ese skill; si el reporte de indicadores no
   * trae la columna de servicio, se toman todos (el agente ya quedó filtrado por
   * el segmento que tiene en la malla).
   */
  registrosDe(nombre) {
    const r = Agentes.rango();
    const sk = Agentes.skillFiltro();
    const enRango = State.registros.filter(x => x.agente === nombre &&
      (!r.desde || x.fecha >= r.desde) && (!r.hasta || x.fecha <= r.hasta));
    const propios = sk ? enRango.filter(x => x.skill === sk) : enRango;
    const usar = (sk && !propios.length && !enRango.some(x => x.skill)) ? enRango : propios;
    return usar.sort((a, b) => a.fecha.localeCompare(b.fecha));
  },

  /** Fechas del periodo presentes en los datos (eje X común a todas las tarjetas). */
  fechasComunes(nombres) {
    const s = new Set();
    nombres.forEach(n => Agentes.registrosDe(n).forEach(r => s.add(r.fecha)));
    return [...s].sort();
  },

  /* ------------------------------- Render -------------------------------- */
  render() {
    Agentes.pintarFichaSel();
    Agentes.renderPicker();
    const tab = State.ui.tabs.agentes || 'a-individual';
    if (tab === 'a-individual') Agentes.renderIndividual();
    else if (tab === 'a-ficha') Agentes.renderFicha();
    else if (tab === 'a-comparar') Agentes.renderComparar();
  },

  /* ---------------- Gráficos individuales (uno por agente) --------------- */
  renderIndividual() {
    const host = document.getElementById('aGrid');
    const inds = App.indicadoresActivos();
    const ind = App.indicador(document.getElementById('aMetric').value) || inds[0];
    const skillSel = Agentes.skillFiltro();
    // Con un skill filtrado solo se muestran los agentes que lo atienden
    const delSkill = new Set(Agentes.agentesDelSkill().map(a => a.nombre));
    let nombres = (State.ui.agentesSel || []).filter(n => !skillSel || delSkill.has(n));

    if (!ind) {
      host.innerHTML = '<div class="card" style="grid-column:1/-1"><div class="empty"><strong>No hay indicadores configurados</strong>Ve a Rendimiento → Indicadores y metas.</div></div>';
      return;
    }
    if (!nombres.length) {
      host.innerHTML = '<div class="card" style="grid-column:1/-1"><div class="empty"><strong>Ningún agente agregado' +
        (skillSel ? ' en ' + U.esc(skillSel) : '') + '</strong>' +
        'Selecciona arriba los agentes que quieras seguir. Cada uno aparecerá con su propio gráfico individual.</div></div>';
      return;
    }

    const conDatos = nombres.map(n => {
      const regs = Agentes.registrosDe(n);
      const prom = U.prom(regs.map(r => r.valores && r.valores[ind.id]));
      const meta = App.metaProm(regs, ind);          // cada agente puede tener su propia meta
      return {
        nombre: n, regs: regs, prom: prom, meta: meta, cump: App.cumplimiento(prom, ind, meta),
        skill: skillSel || Agentes.skillPrincipal(n)
      };
    });

    const orden = document.getElementById('aOrden').value;
    const ordenar = arr => {
      if (orden === 'mejor') return arr.sort((a, b) => (b.cump == null ? -1 : b.cump) - (a.cump == null ? -1 : a.cump));
      if (orden === 'peor') return arr.sort((a, b) => (a.cump == null ? 2 : a.cump) - (b.cump == null ? 2 : b.cump));
      return arr.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    };

    // Sin skill elegido, las tarjetas se agrupan bajo el encabezado de cada skill
    let grupos;
    if (skillSel) {
      grupos = [{ skill: skillSel, agentes: ordenar(conDatos) }];
    } else {
      const mapa = new Map();
      conDatos.forEach(a => { if (!mapa.has(a.skill)) mapa.set(a.skill, []); mapa.get(a.skill).push(a); });
      grupos = [...mapa.entries()].map(([skill, agentes]) => ({ skill: skill, agentes: ordenar(agentes) }))
        .sort((a, b) => a.skill.localeCompare(b.skill, 'es'));
    }

    const fechas = Agentes.fechasComunes(nombres);
    const tipo = document.getElementById('aTipo').value;
    const orden2 = [];                                   // orden real de pintado, para los gráficos

    host.innerHTML = grupos.map(g => {
      const prom = U.prom(g.agentes.map(a => a.prom));
      const metaG = U.prom(g.agentes.map(a => a.meta));
      const cabecera = (grupos.length > 1 || !skillSel)
        ? '<div class="group-head"><span class="group-head__dot"></span>' +
          '<span class="group-head__name">' + U.esc(g.skill) + '</span>' +
          '<span class="group-head__meta">' + g.agentes.length + ' agente' + (g.agentes.length === 1 ? '' : 's') +
          ' · promedio ' + U.fmt(prom, ind.unidad) + ' · meta ' + U.fmt(metaG, ind.unidad) + '</span></div>'
        : '';
      return cabecera + g.agentes.map(a => {
        const i = orden2.push(a) - 1;
        const est = App.estadoCumplimiento(a.cump);
        const vals = a.regs.map(r => r.valores && r.valores[ind.id]).filter(v => v != null);
        const mejor = vals.length ? (ind.direccion === 'down' ? Math.min(...vals) : Math.max(...vals)) : null;
        const puntaje = App.puntaje(a.regs);
        return '<div class="agent-card">' +
          '<div class="agent-card__head">' +
            '<div class="avatar">' + U.esc(U.iniciales(a.nombre)) + '</div>' +
            '<div class="agent-card__id"><div class="agent-card__name">' + U.esc(a.nombre) + '</div>' +
            '<div class="agent-card__meta">' + U.esc(a.skill) + ' · ' + a.regs.length + ' días</div></div>' +
            '<span class="badge ' + est.clase + '">' + est.etiqueta + '</span>' +
          '</div>' +
          '<div class="agent-card__stats">' +
            '<div class="mini-stat"><div class="mini-stat__l">Promedio</div><div class="mini-stat__v">' + U.fmt(a.prom, ind.unidad) + '</div></div>' +
            '<div class="mini-stat"><div class="mini-stat__l">Mejor día</div><div class="mini-stat__v">' + U.fmt(mejor, ind.unidad) + '</div></div>' +
            '<div class="mini-stat"><div class="mini-stat__l">Puntaje</div><div class="mini-stat__v">' + (puntaje == null ? '—' : U.dec(puntaje, 0) + '%') + '</div></div>' +
          '</div>' +
          '<div class="chart-host" id="agc-' + i + '" style="min-height:150px"></div>' +
          '<div class="stack" style="margin-top:6px">' +
            '<button class="link-btn" type="button" onclick="Agentes.verFicha(\'' + U.js(a.nombre) + '\')">Ver ficha completa →</button>' +
            '<button class="link-btn" type="button" onclick="Agentes.quitar(\'' + U.js(a.nombre) + '\')">Quitar del tablero</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }).join('');

    // Un gráfico por tarjeta, con el mismo eje de fechas para poder compararlas de un vistazo
    orden2.forEach((a, i) => {
      const mapa = {};
      a.regs.forEach(r => { if (r.valores && r.valores[ind.id] != null) mapa[r.fecha] = r.valores[ind.id]; });
      const valores = fechas.map(f => mapa[f] == null ? null : mapa[f]);
      const cfg = {
        labels: fechas, unidad: ind.unidad, meta: a.meta, compacto: true, alto: 150,
        formatX: (f, largo) => largo ? U.fechaLarga(f) : U.fechaCorta(f), tituloX: 'Fecha',
        vacio: 'Este agente no tiene datos en el periodo'
      };
      if (tipo === 'bar') {
        Chart.bars('agc-' + i, Object.assign({}, cfg, {
          valores: valores, horizontal: false, alto: 160, color: Chart.css('--s1'), nombreSerie: ind.nombre
        }));
      } else {
        Chart.line('agc-' + i, Object.assign({}, cfg, {
          series: [{ nombre: ind.nombre, valores: valores, color: Chart.css('--s1') }], area: true
        }));
      }
    });
  },

  quitar(nombre) {
    State.ui.agentesSel = (State.ui.agentesSel || []).filter(n => n !== nombre);
    App.guardar(); Agentes.render();
  },

  verFicha(nombre) {
    document.getElementById('aFichaSel').value = nombre;
    App.tab('agentes', 'a-ficha');
  },

  /* --------------------------- Ficha completa ---------------------------- */
  renderFicha() {
    const host = document.getElementById('aFicha');
    const nombre = document.getElementById('aFichaSel').value;
    if (!nombre) {
      host.innerHTML = '<div class="empty"><strong>Selecciona un agente</strong>Aparecerá un gráfico por cada indicador que tengas configurado.</div>';
      return;
    }
    const regs = Agentes.registrosDe(nombre);
    const inds = App.indicadoresActivos();
    if (!regs.length) {
      host.innerHTML = '<div class="empty"><strong>' + U.esc(nombre) + ' no tiene registros en el periodo</strong>Amplía el rango de fechas o carga sus datos.</div>';
      return;
    }
    const fechas = regs.map(r => r.fecha);
    const puntaje = App.puntaje(regs);
    const skills = App.skillsDeAgente(nombre);
    const equipo = State.registros.filter(r => (!Agentes.rango().desde || r.fecha >= Agentes.rango().desde) && (!Agentes.rango().hasta || r.fecha <= Agentes.rango().hasta));

    host.innerHTML =
      '<div class="kpi-row">' +
        '<div class="kpi kpi--hero"><div class="kpi__label">Puntaje global de ' + U.esc(nombre) + '</div>' +
          '<div class="kpi__value">' + (puntaje == null ? '—' : U.dec(puntaje, 1) + '%') + '</div>' +
          '<div class="kpi__foot"><span>' + regs.length + ' días evaluados' + (skills.length ? ' · ' + U.esc(skills.join(', ')) : '') + '</span></div></div>' +
        '<div class="kpi"><div class="kpi__label">Promedio del equipo</div>' +
          '<div class="kpi__value">' + (App.puntaje(equipo) == null ? '—' : U.dec(App.puntaje(equipo), 1) + '%') + '</div>' +
          '<div class="kpi__foot"><span>Referencia para comparar</span></div></div>' +
        '<div class="kpi"><div class="kpi__label">Posición en el ranking</div>' +
          '<div class="kpi__value">' + Agentes.posicion(nombre, equipo) + '</div>' +
          '<div class="kpi__foot"><span>Entre ' + new Set(equipo.map(r => r.agente)).size + ' agentes</span></div></div>' +
      '</div>' +
      '<div class="ficha-grid">' +
        inds.map((m, i) => {
          const val = U.prom(regs.map(r => r.valores && r.valores[m.id]));
          const meta = App.metaProm(regs, m);
          return '<div class="card" style="margin:0"><div class="card__head"><div>' +
            '<h3 class="card__title">' + U.esc(m.nombre) + '</h3>' +
            '<p class="card__sub">Meta ' + U.fmt(meta, m.unidad) + (m.direccion === 'down' ? ' o menos' : ' o más') + '</p></div>' +
            '<span class="badge ' + App.estadoCumplimiento(App.cumplimiento(val, m, meta)).clase + '">' +
            U.fmt(val, m.unidad) + '</span></div>' +
            '<div class="chart-host" id="afc-' + i + '" style="min-height:170px"></div></div>';
        }).join('') +
      '</div>' +
      '<div class="card" style="margin-top:14px"><div class="card__head"><div><h3 class="card__title">Detalle diario</h3>' +
      '<p class="card__sub">Registros de ' + U.esc(nombre) + ' en el periodo</p></div></div>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th class="no-sort">Fecha</th><th class="no-sort">Skill</th>' +
      inds.map(m => '<th class="num no-sort">' + U.esc(m.nombre) + '</th>').join('') + '<th class="no-sort">Observación</th></tr></thead><tbody>' +
      regs.slice().reverse().map(r => '<tr><td>' + U.fechaCorta(r.fecha) + '</td><td>' + U.esc(r.skill || '—') + '</td>' +
        inds.map(m => {
          const c = App.cumplimiento(r.valores && r.valores[m.id], m, App.metaDe(r, m));
          const col = c == null ? '' : c >= 1 ? 'var(--ok)' : c >= .9 ? 'var(--warn)' : 'var(--bad)';
          return '<td class="num" style="color:' + col + '" title="Meta ' + U.fmt(App.metaDe(r, m), m.unidad) + '">' +
            U.fmt(r.valores && r.valores[m.id], m.unidad) + '</td>';
        }).join('') + '<td>' + U.esc(r.nota || '') + '</td></tr>').join('') +
      '</tbody></table></div></div>';

    inds.forEach((m, i) => {
      Chart.line('afc-' + i, {
        labels: fechas,
        series: [{ nombre: m.nombre, valores: regs.map(r => (r.valores && r.valores[m.id]) == null ? null : r.valores[m.id]), color: Chart.css('--s1') }],
        unidad: m.unidad, meta: App.metaProm(regs, m), area: true, alto: 170, compacto: true,
        formatX: (f, largo) => largo ? U.fechaLarga(f) : U.fechaCorta(f), tituloX: 'Fecha'
      });
    });
  },

  posicion(nombre, equipo) {
    const porAgente = new Map();
    equipo.forEach(r => { if (!porAgente.has(r.agente)) porAgente.set(r.agente, []); porAgente.get(r.agente).push(r); });
    const lista = [...porAgente.entries()].map(([n, rs]) => ({ n: n, p: App.puntaje(rs) }))
      .sort((a, b) => (b.p == null ? -1 : b.p) - (a.p == null ? -1 : a.p));
    const i = lista.findIndex(x => x.n === nombre);
    return i < 0 ? '—' : '#' + (i + 1);
  },

  /* ----------------------------- Comparativa ----------------------------- */
  renderComparar() {
    const inds = App.indicadoresActivos();
    const ind = App.indicador(document.getElementById('aMetric').value) || inds[0];
    const skillSel = Agentes.skillFiltro();
    const delSkill = new Set(Agentes.agentesDelSkill().map(a => a.nombre));
    const todos = (State.ui.agentesSel || []).filter(n => !skillSel || delSkill.has(n));
    const nombres = todos.slice(0, 6);
    const fechas = Agentes.fechasComunes(nombres);

    if (!nombres.length || !ind) {
      Chart.vacio(document.getElementById('aCompare'), 'Selecciona agentes para comparar', 'Usa el selector de arriba.');
      document.getElementById('aCompareTable').innerHTML = '<div class="empty">Sin agentes seleccionados</div>';
      return;
    }

    const series = nombres.map((n, i) => {
      const regs = Agentes.registrosDe(n);
      const mapa = {};
      regs.forEach(r => { if (r.valores && r.valores[ind.id] != null) mapa[r.fecha] = r.valores[ind.id]; });
      return { nombre: n, color: Chart.color(i), valores: fechas.map(f => mapa[f] == null ? null : mapa[f]) };
    });

    const regsTodos = nombres.reduce((a, n) => a.concat(Agentes.registrosDe(n)), []);
    Chart.line('aCompare', {
      labels: fechas, series: series, unidad: ind.unidad, meta: App.metaProm(regsTodos, ind), alto: 320,
      formatX: (f, largo) => largo ? U.fechaLarga(f) : U.fechaCorta(f), tituloX: 'Fecha',
      nota: todos.length > 6
        ? 'Se comparan los primeros 6 de ' + todos.length + ' agentes seleccionados. Los demás siguen visibles en la pestaña de gráficos individuales.'
        : 'Cada línea es un agente; la línea punteada es la meta de ' + ind.nombre + '.'
    });

    document.getElementById('aCompareTable').innerHTML =
      '<table class="data"><thead><tr><th class="no-sort">Agente</th><th class="num no-sort">Días</th>' +
      inds.map(m => '<th class="num no-sort">' + U.esc(m.nombre) + '</th>').join('') +
      '<th class="num no-sort">Puntaje</th></tr></thead><tbody>' +
      todos.map(n => {
        const regs = Agentes.registrosDe(n);
        const p = App.puntaje(regs);
        return '<tr><td class="name">' + U.esc(n) + '</td><td class="num">' + regs.length + '</td>' +
          inds.map(m => {
            const v = U.prom(regs.map(r => r.valores && r.valores[m.id]));
            const meta = App.metaProm(regs, m);
            const c = App.cumplimiento(v, m, meta);
            const col = c == null ? '' : c >= 1 ? 'var(--ok)' : c >= .9 ? 'var(--warn)' : 'var(--bad)';
            return '<td class="num" style="color:' + col + ';font-weight:600" title="Meta ' + U.fmt(meta, m.unidad) + '">' +
              U.fmt(v, m.unidad) + '</td>';
          }).join('') +
          '<td class="num"><strong>' + (p == null ? '—' : U.dec(p, 1) + '%') + '</strong></td></tr>';
      }).join('') + '</tbody></table>';
  }
};
