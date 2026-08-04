/* =========================================================================
   charts.js — Gráficos en SVG puro
   Especificaciones fijas: línea de 2px, barras ≤24px con extremo redondeado
   de 4px, marcadores de 8px con anillo del color de la superficie, malla
   discreta de 1px, leyenda para dos o más series y vista de tabla siempre
   disponible. Paleta validada para daltonismo en claro y oscuro.
   ========================================================================= */

'use strict';

const Chart = {
  _cfgs: {},                       // configuración por host, para la vista de tabla

  css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); },
  paleta() { return ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6'].map(v => Chart.css(v)); },
  rampa() { return ['--q0', '--q1', '--q2', '--q3', '--q4', '--q5', '--q6', '--q7'].map(v => Chart.css(v)); },
  color(i) { const p = Chart.paleta(); return p[i % p.length]; },

  el(tag, attrs, texto) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (texto != null) n.textContent = texto;
    return n;
  },

  ancho(host) { return Math.max(280, host.clientWidth || host.parentElement.clientWidth || 600); },

  vacio(host, mensaje, sugerencia) {
    host.innerHTML = '<div class="empty"><strong>' + U.esc(mensaje) + '</strong>' + U.esc(sugerencia || '') + '</div>';
  },

  /** Escala "bonita": devuelve {min, max, ticks[]} con números redondos. */
  escala(min, max, n) {
    n = n || 5;
    if (min === max) { min = min - 1; max = max + 1; }
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    const bruto = (max - min) / n;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(bruto) || 1)));
    const norm = bruto / mag;
    const paso = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    const lo = Math.floor(min / paso) * paso;
    const hi = Math.ceil(max / paso) * paso;
    const ticks = [];
    for (let v = lo; v <= hi + paso / 1000; v += paso) ticks.push(Math.abs(v) < paso / 1e6 ? 0 : v);
    return { min: lo, max: hi, ticks };
  },

  /** Camino de barra con el extremo de dato redondeado (4px) y la base recta. */
  pathBarra(x, y, w, h, r, dir) {
    r = Math.min(r, dir === 'v' ? Math.abs(h) / 2 : Math.abs(w) / 2, 4);
    if (r <= 0.5) return 'M' + x + ',' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'Z';
    if (dir === 'v') {              // columna: crece hacia arriba, se redondea el tope
      return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + (-r) +
             'h' + (w - 2 * r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + 'V' + (y + h) + 'Z';
    }                               // barra horizontal: se redondea el extremo derecho
    return 'M' + x + ',' + y + 'H' + (x + w - r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
           'v' + (h - 2 * r) + 'a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + r + 'H' + x + 'Z';
  },

  /* ------------------------------ Tooltip -------------------------------- */
  tipMostrar(html, ev) {
    const tip = document.getElementById('tip');
    tip.innerHTML = html; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = ev.clientX + 14, y = ev.clientY - r.height - 12;
    if (x + r.width > innerWidth - 10) x = ev.clientX - r.width - 14;
    if (y < 8) y = ev.clientY + 18;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  },
  tipOcultar() { document.getElementById('tip').hidden = true; },

  filaTip(color, nombre, valor) {
    return '<div class="tip__row">' +
      (color ? '<span class="tip__key" style="background:' + color + '"></span>' : '') +
      '<span class="tip__name">' + U.esc(nombre) + '</span><span class="tip__val">' + U.esc(valor) + '</span></div>';
  },

  /* ------------------------------ Leyenda -------------------------------- */
  leyenda(series, tipo) {
    if (series.length < 2) return '';        // una sola serie: el título ya la nombra
    return '<div class="legend">' + series.map(s =>
      '<span class="legend__item"><span class="legend__key' + (tipo === 'line' ? ' legend__key--line' : '') +
      '" style="background:' + s.color + '"></span>' + U.esc(s.nombre) + '</span>').join('') + '</div>';
  },

  /* --------------------------- Vista de tabla ---------------------------- */
  toggleTable(hostId) {
    const cont = document.getElementById(hostId);
    if (!cont) return;
    let tabla = cont.querySelector('.chart-table');
    if (!tabla) {
      tabla = document.createElement('div');
      tabla.className = 'chart-table';
      tabla.innerHTML = Chart.tablaHTML(hostId);
      cont.appendChild(tabla);
    }
    tabla.classList.toggle('is-open');
  },

  tablaHTML(hostId) {
    const c = Chart._cfgs[hostId];
    if (!c) return '<div class="empty">Sin datos</div>';
    let cabeceras, filas;
    if (c.tipo === 'heatmap') {
      cabeceras = [c.tituloFilas || ''].concat(c.columnas);
      filas = c.filas.map((f, i) => [f].concat(c.valores[i].map(v => v == null ? '—' : U.fmt(v, c.unidad))));
    } else if (c.tipo === 'bars' || c.tipo === 'diverging') {
      cabeceras = ['Categoría', 'Valor'];
      filas = c.labels.map((l, i) => [l, U.fmt(c.valores[i], c.unidad)]);
    } else {
      cabeceras = [c.tituloX || 'Fecha'].concat(c.series.map(s => s.nombre));
      filas = c.labels.map((l, i) => [c.formatX ? c.formatX(l) : l].concat(c.series.map(s => U.fmt(s.valores[i], c.unidad))));
    }
    return '<div class="table-wrap"><table class="data"><thead><tr>' +
      cabeceras.map((h, i) => '<th' + (i ? ' class="num"' : '') + '>' + U.esc(h) + '</th>').join('') +
      '</tr></thead><tbody>' +
      filas.map(f => '<tr>' + f.map((c2, i) => '<td' + (i ? ' class="num"' : '') + '>' + U.esc(c2) + '</td>').join('') + '</tr>').join('') +
      '</tbody></table></div>';
  },

  _montar(host, svg, extraHTML, cfg, hostId) {
    Chart._cfgs[hostId] = cfg;
    host.innerHTML = '';
    host.appendChild(svg);
    if (extraHTML) host.insertAdjacentHTML('beforeend', extraHTML);
  },

  /* ================================ LÍNEA ================================ */
  /**
   * cfg: labels[], series[{nombre,valores[],color?}], unidad, meta, metaLabel,
   *      area(bool), alto, formatX(fn), nota, sinEjeY(bool), compacto(bool)
   */
  line(hostId, cfg) {
    const host = document.getElementById(hostId);
    if (!host) return;
    const series = (cfg.series || []).filter(s => s.valores.some(v => v != null));
    if (!cfg.labels || !cfg.labels.length || !series.length) {
      return Chart.vacio(host, 'Sin datos para graficar', cfg.vacio || 'Carga registros o ajusta los filtros.');
    }
    series.forEach((s, i) => { if (!s.color) s.color = Chart.color(i); });

    const compacto = !!cfg.compacto;
    const W = Chart.ancho(host);
    const H = cfg.alto || (compacto ? 170 : 280);
    const m = { t: compacto ? 14 : 20, r: compacto ? 14 : 22, b: compacto ? 24 : 34, l: compacto ? 40 : 52 };

    let vmin = Infinity, vmax = -Infinity;
    series.forEach(s => s.valores.forEach(v => { if (v != null && isFinite(v)) { vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); } }));
    if (cfg.meta != null) { vmin = Math.min(vmin, cfg.meta); vmax = Math.max(vmax, cfg.meta); }
    if (cfg.desdeCero !== false && vmin > 0) vmin = 0;
    const esc = Chart.escala(vmin, vmax, compacto ? 3 : 5);

    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const n = cfg.labels.length;
    const X = i => m.l + (n === 1 ? pw / 2 : (pw * i) / (n - 1));
    const Y = v => m.t + ph - ((v - esc.min) / (esc.max - esc.min || 1)) * ph;

    const svg = Chart.el('svg', { class: 'chart-svg', viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    const surf = Chart.css('--surface');

    // Malla + eje Y
    esc.ticks.forEach(t => {
      svg.appendChild(Chart.el('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: 'grid-line' }));
      if (!cfg.sinEjeY) svg.appendChild(Chart.el('text', { x: m.l - 8, y: Y(t) + 3.5, class: 'axis-label', 'text-anchor': 'end' }, U.fmt(t, cfg.unidad, cfg.unidad === 'pct' ? 0 : undefined)));
    });
    svg.appendChild(Chart.el('line', { x1: m.l, x2: W - m.r, y1: m.t + ph, y2: m.t + ph, class: 'axis-line' }));

    // Eje X con etiquetas espaciadas
    const maxEtq = Math.max(2, Math.floor(pw / (compacto ? 52 : 76)));
    const salto = Math.max(1, Math.ceil(n / maxEtq));
    cfg.labels.forEach((l, i) => {
      if (i % salto !== 0 && i !== n - 1) return;
      svg.appendChild(Chart.el('text', { x: X(i), y: H - m.b + 15, class: 'axis-label', 'text-anchor': 'middle' },
        cfg.formatX ? cfg.formatX(l) : String(l)));
    });

    // Línea de meta
    if (cfg.meta != null && isFinite(cfg.meta)) {
      svg.appendChild(Chart.el('line', { x1: m.l, x2: W - m.r, y1: Y(cfg.meta), y2: Y(cfg.meta), class: 'goal-line' }));
      if (!compacto) svg.appendChild(Chart.el('text', { x: W - m.r, y: Y(cfg.meta) - 5, class: 'goal-tag', 'text-anchor': 'end' },
        (cfg.metaLabel || 'Meta') + ' ' + U.fmt(cfg.meta, cfg.unidad)));
    }

    // Series
    series.forEach(s => {
      const pts = [];
      s.valores.forEach((v, i) => { if (v != null && isFinite(v)) pts.push([X(i), Y(v), i, v]); });
      if (!pts.length) return;

      if (cfg.area && series.length === 1) {
        const d = 'M' + pts[0][0] + ',' + (m.t + ph) + pts.map(p => 'L' + p[0] + ',' + p[1]).join('') +
                  'L' + pts[pts.length - 1][0] + ',' + (m.t + ph) + 'Z';
        svg.appendChild(Chart.el('path', { d: d, fill: s.color, 'fill-opacity': .10, stroke: 'none' }));
      }
      svg.appendChild(Chart.el('path', {
        d: 'M' + pts.map(p => p[0] + ',' + p[1]).join('L'),
        fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }));

      // Marcadores: todos si son pocos puntos, si no solo el extremo
      const mostrar = pts.length <= (compacto ? 14 : 24) ? pts : [pts[pts.length - 1]];
      mostrar.forEach(p => {
        svg.appendChild(Chart.el('circle', { cx: p[0], cy: p[1], r: 4, fill: s.color, stroke: surf, 'stroke-width': 2 }));
      });

      // Etiqueta directa en el extremo (solo si hay espacio)
      if (!compacto && series.length <= 4) {
        const ult = pts[pts.length - 1];
        svg.appendChild(Chart.el('text', { x: ult[0], y: ult[1] - 11, class: 'value-label', 'text-anchor': ult[0] > W - m.r - 30 ? 'end' : 'middle' },
          U.fmt(ult[3], cfg.unidad)));
      }
    });

    // Capa de interacción: cruceta + tooltip
    const guia = Chart.el('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ph, stroke: Chart.css('--line-2'), 'stroke-width': 1, opacity: 0 });
    svg.appendChild(guia);
    const capa = Chart.el('rect', { x: m.l, y: m.t, width: pw, height: ph, class: 'hit' });
    svg.appendChild(capa);

    capa.addEventListener('mousemove', ev => {
      const caja = svg.getBoundingClientRect();
      const px = ((ev.clientX - caja.left) / caja.width) * W;
      let idx = n === 1 ? 0 : Math.round(((px - m.l) / pw) * (n - 1));
      idx = U.clamp(idx, 0, n - 1);
      guia.setAttribute('x1', X(idx)); guia.setAttribute('x2', X(idx)); guia.setAttribute('opacity', 1);
      const html = '<div class="tip__title">' + U.esc(cfg.formatX ? cfg.formatX(cfg.labels[idx], true) : cfg.labels[idx]) + '</div>' +
        series.map(s => Chart.filaTip(s.color, s.nombre, U.fmt(s.valores[idx], cfg.unidad))).join('') +
        (cfg.meta != null ? Chart.filaTip(null, 'Meta', U.fmt(cfg.meta, cfg.unidad)) : '');
      Chart.tipMostrar(html, ev);
    });
    capa.addEventListener('mouseleave', () => { guia.setAttribute('opacity', 0); Chart.tipOcultar(); });

    Chart._montar(host, svg,
      Chart.leyenda(series, 'line') + (cfg.nota ? '<p class="chart-note">' + U.esc(cfg.nota) + '</p>' : ''),
      { tipo: 'line', labels: cfg.labels, series: series, unidad: cfg.unidad, formatX: cfg.formatX, tituloX: cfg.tituloX }, hostId);
  },

  /* ================================ BARRAS =============================== */
  /**
   * cfg: labels[], valores[], unidad, meta, horizontal(bool), alto, color,
   *      colores[] (por barra), nota, etiquetas(bool)
   */
  bars(hostId, cfg) {
    const host = document.getElementById(hostId);
    if (!host) return;
    if (!cfg.labels || !cfg.labels.length) {
      return Chart.vacio(host, 'Sin datos para graficar', cfg.vacio || 'Carga registros o ajusta los filtros.');
    }
    const horizontal = cfg.horizontal !== false;
    const W = Chart.ancho(host);
    const n = cfg.labels.length;
    const colorBase = cfg.color || Chart.color(0);
    const surf = Chart.css('--surface');
    const vals = cfg.valores.map(v => (v == null || !isFinite(v)) ? 0 : v);
    const esc = Chart.escala(Math.min(0, Math.min(...vals)), Math.max(cfg.meta != null ? cfg.meta : -Infinity, Math.max(...vals)), 4);

    const svg = Chart.el('svg', { class: 'chart-svg', role: 'img' });

    if (horizontal) {
      const anchoEtq = Math.min(180, Math.max(90, ...cfg.labels.map(l => String(l).length * 6.6)));
      const m = { t: 8, r: 60, b: 26, l: anchoEtq + 10 };
      const banda = Math.max(24, Math.min(44, cfg.alto ? (cfg.alto - m.t - m.b) / n : 34));
      const grosor = Math.min(24, banda - 10);
      const H = m.t + m.b + banda * n;
      const pw = W - m.l - m.r;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      const X = v => m.l + ((v - esc.min) / (esc.max - esc.min || 1)) * pw;

      esc.ticks.forEach(t => {
        svg.appendChild(Chart.el('line', { x1: X(t), x2: X(t), y1: m.t, y2: m.t + banda * n, class: 'grid-line' }));
        svg.appendChild(Chart.el('text', { x: X(t), y: H - m.b + 15, class: 'axis-label', 'text-anchor': 'middle' }, U.fmt(t, cfg.unidad, 0)));
      });
      svg.appendChild(Chart.el('line', { x1: X(esc.min < 0 ? 0 : esc.min), x2: X(esc.min < 0 ? 0 : esc.min), y1: m.t, y2: m.t + banda * n, class: 'axis-line' }));

      cfg.labels.forEach((l, i) => {
        const y = m.t + i * banda + (banda - grosor) / 2;
        const c = (cfg.colores && cfg.colores[i]) || colorBase;
        const x0 = X(Math.min(0, esc.min < 0 ? 0 : esc.min));
        const w = Math.max(1.5, X(vals[i]) - x0);
        svg.appendChild(Chart.el('text', { x: m.l - 10, y: y + grosor / 2 + 4, class: 'axis-label', 'text-anchor': 'end', fill: Chart.css('--ink-2') },
          String(l).length > 24 ? String(l).slice(0, 23) + '…' : String(l)));
        const barra = Chart.el('path', { d: Chart.pathBarra(x0, y, w, grosor, 4, 'h'), fill: c });
        svg.appendChild(barra);
        if (cfg.etiquetas !== false) {
          svg.appendChild(Chart.el('text', { x: x0 + w + 8, y: y + grosor / 2 + 4, class: 'value-label' }, U.fmt(cfg.valores[i], cfg.unidad)));
        }
        const hit = Chart.el('rect', { x: m.l, y: m.t + i * banda, width: pw, height: banda, class: 'hit' });
        hit.addEventListener('mousemove', ev => Chart.tipMostrar(
          '<div class="tip__title">' + U.esc(l) + '</div>' + Chart.filaTip(c, cfg.nombreSerie || 'Valor', U.fmt(cfg.valores[i], cfg.unidad)) +
          (cfg.meta != null ? Chart.filaTip(null, 'Meta', U.fmt(cfg.meta, cfg.unidad)) : ''), ev));
        hit.addEventListener('mouseleave', Chart.tipOcultar);
        svg.appendChild(hit);
      });

      if (cfg.meta != null && isFinite(cfg.meta)) {
        svg.appendChild(Chart.el('line', { x1: X(cfg.meta), x2: X(cfg.meta), y1: m.t - 2, y2: m.t + banda * n, class: 'goal-line' }));
        svg.appendChild(Chart.el('text', { x: X(cfg.meta), y: m.t - 6, class: 'goal-tag', 'text-anchor': 'middle' }, 'Meta'));
      }
    } else {
      const H = cfg.alto || 280;
      const m = { t: 22, r: 14, b: 42, l: 52 };
      const pw = W - m.l - m.r, ph = H - m.t - m.b;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      const banda = pw / n;
      const grosor = Math.min(24, Math.max(4, banda - 8));   // deja aire: nunca llena la banda
      const Y = v => m.t + ph - ((v - esc.min) / (esc.max - esc.min || 1)) * ph;

      esc.ticks.forEach(t => {
        svg.appendChild(Chart.el('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: 'grid-line' }));
        svg.appendChild(Chart.el('text', { x: m.l - 8, y: Y(t) + 3.5, class: 'axis-label', 'text-anchor': 'end' }, U.fmt(t, cfg.unidad, 0)));
      });
      svg.appendChild(Chart.el('line', { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), class: 'axis-line' }));

      const salto = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 60))));
      cfg.labels.forEach((l, i) => {
        const x = m.l + i * banda + (banda - grosor) / 2;
        const c = (cfg.colores && cfg.colores[i]) || colorBase;
        const y = Y(Math.max(0, vals[i])), h = Math.max(1.5, Math.abs(Y(vals[i]) - Y(0)));
        svg.appendChild(Chart.el('path', { d: Chart.pathBarra(x, y, grosor, h, 4, 'v'), fill: c }));
        if (i % salto === 0) {
          svg.appendChild(Chart.el('text', { x: m.l + i * banda + banda / 2, y: H - m.b + 16, class: 'axis-label', 'text-anchor': 'middle' },
            cfg.formatX ? cfg.formatX(l) : String(l)));
        }
        const hit = Chart.el('rect', { x: m.l + i * banda, y: m.t, width: banda, height: ph, class: 'hit' });
        hit.addEventListener('mousemove', ev => Chart.tipMostrar(
          '<div class="tip__title">' + U.esc(cfg.formatX ? cfg.formatX(l, true) : l) + '</div>' +
          Chart.filaTip(c, cfg.nombreSerie || 'Valor', U.fmt(cfg.valores[i], cfg.unidad)) +
          (cfg.meta != null ? Chart.filaTip(null, 'Meta', U.fmt(cfg.meta, cfg.unidad)) : ''), ev));
        hit.addEventListener('mouseleave', Chart.tipOcultar);
        svg.appendChild(hit);
      });

      if (cfg.meta != null && isFinite(cfg.meta)) {
        svg.appendChild(Chart.el('line', { x1: m.l, x2: W - m.r, y1: Y(cfg.meta), y2: Y(cfg.meta), class: 'goal-line' }));
        svg.appendChild(Chart.el('text', { x: W - m.r, y: Y(cfg.meta) - 5, class: 'goal-tag', 'text-anchor': 'end' }, 'Meta ' + U.fmt(cfg.meta, cfg.unidad)));
      }
    }

    Chart._montar(host, svg, cfg.nota ? '<p class="chart-note">' + U.esc(cfg.nota) + '</p>' : '',
      { tipo: 'bars', labels: cfg.labels, valores: cfg.valores, unidad: cfg.unidad }, hostId);
  },

  /* ============================== DIVERGENTE ============================= */
  /** Columnas centradas en cero: positivo en azul, negativo en rojo. */
  diverging(hostId, cfg) {
    const host = document.getElementById(hostId);
    if (!host) return;
    if (!cfg.labels || !cfg.labels.length) return Chart.vacio(host, 'Sin datos', cfg.vacio || '');

    const W = Chart.ancho(host), H = cfg.alto || 240;
    const m = { t: 22, r: 16, b: 38, l: 46 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const n = cfg.labels.length;
    const vals = cfg.valores.map(v => v == null ? 0 : v);
    const lim = Math.max(1, Math.max(...vals.map(Math.abs)));
    const esc = Chart.escala(-lim, lim, 4);
    const Y = v => m.t + ph - ((v - esc.min) / (esc.max - esc.min || 1)) * ph;
    const banda = pw / n, grosor = Math.min(24, Math.max(3, banda - 4));   // 2px de aire a cada lado
    const pos = Chart.css('--s5'), neg = Chart.css('--s6');

    const svg = Chart.el('svg', { class: 'chart-svg', viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    esc.ticks.forEach(t => {
      svg.appendChild(Chart.el('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: 'grid-line' }));
      svg.appendChild(Chart.el('text', { x: m.l - 8, y: Y(t) + 3.5, class: 'axis-label', 'text-anchor': 'end' }, U.fmt(t, cfg.unidad, 0)));
    });
    svg.appendChild(Chart.el('line', { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), class: 'axis-line' }));

    const salto = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 56))));
    cfg.labels.forEach((l, i) => {
      const v = vals[i], c = v < 0 ? neg : pos;
      const x = m.l + i * banda + (banda - grosor) / 2;
      const y = Math.min(Y(0), Y(v)), h = Math.max(1.5, Math.abs(Y(v) - Y(0)));
      svg.appendChild(Chart.el('path', { d: Chart.pathBarra(x, v < 0 ? y : y, grosor, h, 4, 'v'), fill: c, transform: v < 0 ? 'rotate(180 ' + (x + grosor / 2) + ' ' + (y + h / 2) + ')' : null }));
      if (i % salto === 0) svg.appendChild(Chart.el('text', { x: x + grosor / 2, y: H - m.b + 16, class: 'axis-label', 'text-anchor': 'middle' }, String(l)));
      const hit = Chart.el('rect', { x: m.l + i * banda, y: m.t, width: banda, height: ph, class: 'hit' });
      hit.addEventListener('mousemove', ev => Chart.tipMostrar(
        '<div class="tip__title">' + U.esc(l) + '</div>' +
        Chart.filaTip(c, v < 0 ? 'Déficit' : 'Superávit', U.fmt(Math.abs(v), cfg.unidad)) +
        (cfg.detalle && cfg.detalle[i] ? cfg.detalle[i] : ''), ev));
      hit.addEventListener('mouseleave', Chart.tipOcultar);
      svg.appendChild(hit);
    });

    Chart._montar(host, svg,
      '<div class="legend"><span class="legend__item"><span class="legend__key" style="background:' + pos + '"></span>Superávit (personal de más)</span>' +
      '<span class="legend__item"><span class="legend__key" style="background:' + neg + '"></span>Déficit (falta personal)</span></div>' +
      (cfg.nota ? '<p class="chart-note">' + U.esc(cfg.nota) + '</p>' : ''),
      { tipo: 'diverging', labels: cfg.labels, valores: cfg.valores, unidad: cfg.unidad }, hostId);
  },

  /* =============================== HEATMAP =============================== */
  /** cfg: filas[], columnas[], valores[][], unidad, tituloFilas, nota */
  heatmap(hostId, cfg) {
    const host = document.getElementById(hostId);
    if (!host) return;
    if (!cfg.filas || !cfg.filas.length || !cfg.columnas.length) return Chart.vacio(host, 'Sin datos', cfg.vacio || '');

    const W = Chart.ancho(host);
    const anchoEtq = Math.min(150, Math.max(80, ...cfg.filas.map(f => String(f).length * 6.6)));
    const m = { t: 26, r: 12, b: 8, l: anchoEtq + 8 };
    const nc = cfg.columnas.length, nf = cfg.filas.length;
    const cw = Math.max(12, (W - m.l - m.r) / nc);
    const ch = Math.max(20, Math.min(34, 320 / nf));
    const H = m.t + m.b + ch * nf;

    let max = 0;
    cfg.valores.forEach(f => f.forEach(v => { if (v != null && v > max) max = v; }));
    const rampa = Chart.rampa();
    const paso = v => v == null || max === 0 ? rampa[0] : rampa[U.clamp(Math.ceil((v / max) * (rampa.length - 1)), 0, rampa.length - 1)];

    const svg = Chart.el('svg', { class: 'chart-svg', viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    const saltoCol = Math.max(1, Math.ceil(nc / Math.max(2, Math.floor((W - m.l) / 46))));

    cfg.columnas.forEach((c, j) => {
      if (j % saltoCol) return;
      svg.appendChild(Chart.el('text', { x: m.l + j * cw + cw / 2, y: m.t - 9, class: 'heat-label', 'text-anchor': 'middle' }, String(c)));
    });

    cfg.filas.forEach((f, i) => {
      svg.appendChild(Chart.el('text', { x: m.l - 9, y: m.t + i * ch + ch / 2 + 4, class: 'axis-label', 'text-anchor': 'end', fill: Chart.css('--ink-2') },
        String(f).length > 20 ? String(f).slice(0, 19) + '…' : String(f)));
      cfg.columnas.forEach((c, j) => {
        const v = cfg.valores[i][j];
        const cel = Chart.el('rect', { x: m.l + j * cw + 1, y: m.t + i * ch + 1, width: Math.max(2, cw - 2), height: ch - 2, rx: 3, fill: paso(v), class: 'heat-cell' });
        cel.addEventListener('mousemove', ev => Chart.tipMostrar(
          '<div class="tip__title">' + U.esc(f) + ' · ' + U.esc(c) + '</div>' +
          Chart.filaTip(paso(v), cfg.nombreSerie || 'Conectados', U.fmt(v, cfg.unidad)), ev));
        cel.addEventListener('mouseleave', Chart.tipOcultar);
        svg.appendChild(cel);
        if (cw >= 34 && ch >= 22 && v != null && v > 0) {
          const claro = (v / max) < 0.55;
          svg.appendChild(Chart.el('text', {
            x: m.l + j * cw + cw / 2, y: m.t + i * ch + ch / 2 + 3.5, 'text-anchor': 'middle',
            'font-size': 10, 'font-weight': 650, fill: claro ? Chart.css('--ink-2') : '#fff'
          }, U.fmt(v, cfg.unidad, 0)));
        }
      });
    });

    const escalaHTML = '<div class="legend"><span class="legend__item">Menos</span>' +
      rampa.map(c => '<span class="legend__key" style="background:' + c + ';width:22px;height:11px;border-radius:2px"></span>').join('') +
      '<span class="legend__item">Más (' + U.fmt(max, cfg.unidad, 0) + ')</span></div>';

    Chart._montar(host, svg, escalaHTML + (cfg.nota ? '<p class="chart-note">' + U.esc(cfg.nota) + '</p>' : ''),
      { tipo: 'heatmap', filas: cfg.filas, columnas: cfg.columnas, valores: cfg.valores, unidad: cfg.unidad, tituloFilas: cfg.tituloFilas }, hostId);
  },

  /* ================================ MEDIDOR ============================== */
  /** Devuelve el HTML de un medidor de cumplimiento contra la meta. */
  meterHTML(nombre, valor, ind) {
    const c = App.cumplimiento(valor, ind);
    const est = App.estadoCumplimiento(c);
    const pct = c == null ? 0 : U.clamp(c * 100, 0, 100);
    const relleno = c == null ? 'var(--series-muted)' : c >= 1 ? 'var(--ok)' : c >= 0.9 ? 'var(--warn)' : 'var(--bad)';
    return '<div class="meter">' +
      '<div class="meter__top"><span class="meter__name">' + U.esc(nombre) + '</span>' +
        '<span class="meter__val">' + U.fmt(valor, ind.unidad) + ' <span class="badge ' + est.clase + '">' + est.etiqueta + '</span></span></div>' +
      '<div class="meter__track"><div class="meter__fill" style="width:' + pct.toFixed(1) + '%;background:' + relleno + '"></div>' +
        '<div class="meter__goal" style="left:' + (c == null ? 100 : U.clamp(100 / Math.max(c, 1), 0, 100)).toFixed(1) + '%"></div></div>' +
      '<div class="meter__foot"><span>Meta: ' + U.fmt(ind.meta, ind.unidad) + (ind.direccion === 'down' ? ' o menos' : ' o más') + '</span>' +
        '<span>' + (c == null ? 'Sin dato' : U.dec(c * 100, 0) + ' % de cumplimiento') + '</span></div>' +
      '</div>';
  }
};
