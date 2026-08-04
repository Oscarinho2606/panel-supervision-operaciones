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
    if (previo && inds.some(m => m.id === previo)) sel.value = previo;

    const r = App.rangoDatos(State.registros);
    if (!document.getElementById('aDesde').value) document.getElementById('aDesde').value = r.min;
    if (!document.getElementById('aHasta').value) document.getElementById('aHasta').value = r.max;

    // Si nunca ha elegido, arranca con los primeros 6 agentes disponibles
    if (!State.ui.agentesSel || !State.ui.agentesSel.length) {
      State.ui.agentesSel = App.agentes().slice(0, 6).map(a => a.nombre);
    }
    Agentes.pintarFichaSel();
  },

  /* ------------------------------ Selector ------------------------------- */
  renderPicker() {
    const host = document.getElementById('aPicker');
    const b = U.norm(document.getElementById('aBuscar').value || '');
    const todos = App.agentes();
    const lista = b ? todos.filter(a => U.norm(a.nombre + ' ' + a.doc).indexOf(b) > -1) : todos;

    if (!todos.length) {
      host.innerHTML = '<div class="empty" style="padding:18px"><strong>Todavía no hay agentes</strong>Carga registros de rendimiento o una malla de turnos para que aparezcan aquí.</div>';
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
    State.ui.agentesSel = App.agentes().map(a => a.nombre);
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
    const lista = App.agentes();
    sel.innerHTML = lista.map(a => '<option value="' + U.esc(a.nombre) + '">' + U.esc(a.nombre) + '</option>').join('');
    if (previo && lista.some(a => a.nombre === previo)) sel.value = previo;
  },

  /* ------------------------------- Datos --------------------------------- */
  rango() {
    return { desde: document.getElementById('aDesde').value, hasta: document.getElementById('aHasta').value };
  },

  registrosDe(nombre) {
    const r = Agentes.rango();
    return State.registros
      .filter(x => x.agente === nombre && (!r.desde || x.fecha >= r.desde) && (!r.hasta || x.fecha <= r.hasta))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
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
    let nombres = (State.ui.agentesSel || []).slice();

    if (!nombres.length) {
      host.innerHTML = '<div class="card"><div class="empty"><strong>Ningún agente agregado</strong>' +
        'Selecciona arriba los agentes que quieras seguir. Cada uno aparecerá con su propio gráfico individual.</div></div>';
      return;
    }
    if (!ind) {
      host.innerHTML = '<div class="card"><div class="empty"><strong>No hay indicadores configurados</strong>Ve a Rendimiento → Indicadores y metas.</div></div>';
      return;
    }

    // Orden de las tarjetas
    const conDatos = nombres.map(n => {
      const regs = Agentes.registrosDe(n);
      const prom = U.prom(regs.map(r => r.valores && r.valores[ind.id]));
      return { nombre: n, regs: regs, prom: prom, cump: App.cumplimiento(prom, ind) };
    });
    const orden = document.getElementById('aOrden').value;
    if (orden === 'mejor') conDatos.sort((a, b) => (b.cump == null ? -1 : b.cump) - (a.cump == null ? -1 : a.cump));
    else if (orden === 'peor') conDatos.sort((a, b) => (a.cump == null ? 2 : a.cump) - (b.cump == null ? 2 : b.cump));
    else conDatos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    const fechas = Agentes.fechasComunes(nombres);
    const tipo = document.getElementById('aTipo').value;

    host.innerHTML = conDatos.map((a, i) => {
      const est = App.estadoCumplimiento(a.cump);
      const vals = a.regs.map(r => r.valores && r.valores[ind.id]).filter(v => v != null);
      const mejor = vals.length ? (ind.direccion === 'down' ? Math.min(...vals) : Math.max(...vals)) : null;
      const puntaje = App.puntaje(a.regs);
      const skills = [...new Set(a.regs.map(r => r.skill).filter(Boolean))];
      return '<div class="agent-card">' +
        '<div class="agent-card__head">' +
          '<div class="avatar">' + U.esc(U.iniciales(a.nombre)) + '</div>' +
          '<div class="agent-card__id"><div class="agent-card__name">' + U.esc(a.nombre) + '</div>' +
          '<div class="agent-card__meta">' + (skills.length ? U.esc(skills.join(' · ')) : 'Sin skill') + ' · ' + a.regs.length + ' días</div></div>' +
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

    // Un gráfico por tarjeta, con el mismo eje de fechas para poder compararlas de un vistazo
    conDatos.forEach((a, i) => {
      const mapa = {};
      a.regs.forEach(r => { if (r.valores && r.valores[ind.id] != null) mapa[r.fecha] = r.valores[ind.id]; });
      const valores = fechas.map(f => mapa[f] == null ? null : mapa[f]);
      const cfg = {
        labels: fechas, unidad: ind.unidad, meta: ind.meta, compacto: true, alto: 150,
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
    const skills = [...new Set(regs.map(r => r.skill).filter(Boolean))];
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
        inds.map((m, i) =>
          '<div class="card" style="margin:0"><div class="card__head"><div>' +
          '<h3 class="card__title">' + U.esc(m.nombre) + '</h3>' +
          '<p class="card__sub">Meta ' + U.fmt(m.meta, m.unidad) + (m.direccion === 'down' ? ' o menos' : ' o más') + '</p></div>' +
          '<span class="badge ' + App.estadoCumplimiento(App.cumplimiento(U.prom(regs.map(r => r.valores && r.valores[m.id])), m)).clase + '">' +
          U.fmt(U.prom(regs.map(r => r.valores && r.valores[m.id])), m.unidad) + '</span></div>' +
          '<div class="chart-host" id="afc-' + i + '" style="min-height:170px"></div></div>'
        ).join('') +
      '</div>' +
      '<div class="card" style="margin-top:14px"><div class="card__head"><div><h3 class="card__title">Detalle diario</h3>' +
      '<p class="card__sub">Registros de ' + U.esc(nombre) + ' en el periodo</p></div></div>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th class="no-sort">Fecha</th><th class="no-sort">Skill</th>' +
      inds.map(m => '<th class="num no-sort">' + U.esc(m.nombre) + '</th>').join('') + '<th class="no-sort">Observación</th></tr></thead><tbody>' +
      regs.slice().reverse().map(r => '<tr><td>' + U.fechaCorta(r.fecha) + '</td><td>' + U.esc(r.skill || '—') + '</td>' +
        inds.map(m => {
          const c = App.cumplimiento(r.valores && r.valores[m.id], m);
          const col = c == null ? '' : c >= 1 ? 'var(--ok)' : c >= .9 ? 'var(--warn)' : 'var(--bad)';
          return '<td class="num" style="color:' + col + '">' + U.fmt(r.valores && r.valores[m.id], m.unidad) + '</td>';
        }).join('') + '<td>' + U.esc(r.nota || '') + '</td></tr>').join('') +
      '</tbody></table></div></div>';

    inds.forEach((m, i) => {
      Chart.line('afc-' + i, {
        labels: fechas,
        series: [{ nombre: m.nombre, valores: regs.map(r => (r.valores && r.valores[m.id]) == null ? null : r.valores[m.id]), color: Chart.css('--s1') }],
        unidad: m.unidad, meta: m.meta, area: true, alto: 170, compacto: true,
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
    const todos = (State.ui.agentesSel || []);
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

    Chart.line('aCompare', {
      labels: fechas, series: series, unidad: ind.unidad, meta: ind.meta, alto: 320,
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
            const c = App.cumplimiento(v, m);
            const col = c == null ? '' : c >= 1 ? 'var(--ok)' : c >= .9 ? 'var(--warn)' : 'var(--bad)';
            return '<td class="num" style="color:' + col + ';font-weight:600">' + U.fmt(v, m.unidad) + '</td>';
          }).join('') +
          '<td class="num"><strong>' + (p == null ? '—' : U.dec(p, 1) + '%') + '</strong></td></tr>';
      }).join('') + '</tbody></table>';
  }
};
