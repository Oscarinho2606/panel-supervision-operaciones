/* =========================================================================
   sheets.js — Lectura de archivos .xlsx / .xlsm / .csv sin librerías externas
   El archivo se abre en el navegador: nunca sale del equipo del usuario.
   ========================================================================= */

'use strict';

const Sheets = {

  /** Punto de entrada: devuelve { nombre, hojas: [{nombre, filas}] } */
  async leer(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'csv' || ext === 'txt') {
      const texto = await Sheets._texto(file);
      return { nombre: file.name, hojas: [{ nombre: 'CSV', filas: Sheets.parseCSV(texto) }] };
    }
    if (ext === 'xls') throw new Error('El formato .xls antiguo no es compatible. Guarda el archivo como .xlsx o .csv desde Excel.');
    return await Sheets.leerXlsx(file);
  },

  async _texto(file) {
    const buf = await file.arrayBuffer();
    let txt = new TextDecoder('utf-8').decode(buf);
    // Si aparecen caracteres de reemplazo, el archivo venía en Latin-1 (Excel de Windows)
    if (/�/.test(txt)) txt = new TextDecoder('windows-1252').decode(buf);
    return txt.replace(/^﻿/, '');
  },

  /* ------------------------------- CSV ---------------------------------- */
  parseCSV(texto) {
    const muestra = texto.slice(0, 5000);
    const cuenta = d => (muestra.match(new RegExp('\\' + d, 'g')) || []).length;
    const delim = [';', ',', '\t', '|'].sort((a, b) => cuenta(b) - cuenta(a))[0];

    const filas = []; let fila = []; let campo = ''; let enComillas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (enComillas) {
        if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else enComillas = false; }
        else campo += c;
      } else if (c === '"') enComillas = true;
      else if (c === delim) { fila.push(campo); campo = ''; }
      else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
      else if (c === '\r') { /* ignorar */ }
      else campo += c;
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    return filas.filter(f => f.some(c => String(c).trim() !== ''));
  },

  /* ------------------------------- XLSX --------------------------------- */
  async leerXlsx(file) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Este navegador no puede descomprimir .xlsx. Actualiza el navegador o guarda el archivo como .csv.');
    }
    const buf = await file.arrayBuffer();
    const zip = await Sheets._unzip(buf);
    const txt = n => zip[n] ? new TextDecoder('utf-8').decode(zip[n]) : null;
    const xml = n => { const t = txt(n); return t ? new DOMParser().parseFromString(t, 'application/xml') : null; };

    const wb = xml('xl/workbook.xml');
    if (!wb) throw new Error('El archivo no parece un Excel válido.');

    // rId -> ruta de la hoja
    const relsDoc = xml('xl/_rels/workbook.xml.rels');
    const rels = {};
    if (relsDoc) [...relsDoc.getElementsByTagName('Relationship')].forEach(r => {
      let t = r.getAttribute('Target') || '';
      if (t.indexOf('/') === 0) t = t.slice(1); else if (t.indexOf('xl/') !== 0) t = 'xl/' + t;
      rels[r.getAttribute('Id')] = t.replace('xl/../', '');
    });

    const compartidas = Sheets._sharedStrings(xml('xl/sharedStrings.xml'));
    const formatos = Sheets._estilos(xml('xl/styles.xml'));

    const hojas = [];
    const nodos = [...wb.getElementsByTagName('sheet')];
    nodos.forEach((s, i) => {
      const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let ruta = rels[rid];
      if (!ruta || !zip[ruta]) ruta = 'xl/worksheets/sheet' + (i + 1) + '.xml';
      const doc = xml(ruta);
      if (!doc) return;
      hojas.push({ nombre: s.getAttribute('name') || ('Hoja ' + (i + 1)), filas: Sheets._hoja(doc, compartidas, formatos) });
    });

    if (!hojas.length) throw new Error('El Excel no tiene hojas legibles.');
    return { nombre: file.name, hojas };
  },

  _sharedStrings(doc) {
    if (!doc) return [];
    return [...doc.getElementsByTagName('si')].map(si => {
      // Ignora las anotaciones fonéticas (rPh) y concatena los fragmentos de texto
      let out = '';
      const rec = nodo => {
        for (const hijo of nodo.childNodes) {
          if (hijo.nodeType !== 1) continue;
          const tag = hijo.tagName.replace(/^.*:/, '');
          if (tag === 'rPh') continue;
          if (tag === 't') out += hijo.textContent;
          else rec(hijo);
        }
      };
      rec(si);
      return out;
    });
  },

  /** Devuelve, por índice de estilo, si la celda es fecha, hora o ambas. */
  _estilos(doc) {
    const FECHA = { 14: 'd', 15: 'd', 16: 'd', 17: 'd', 22: 'dt', 18: 't', 19: 't', 20: 't', 21: 't', 45: 't', 46: 't', 47: 't' };
    if (!doc) return [];
    const custom = {};
    [...doc.getElementsByTagName('numFmt')].forEach(f => {
      const code = (f.getAttribute('formatCode') || '').replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '');
      const tieneFecha = /[dy]/i.test(code);
      const tieneHora = /h|s/i.test(code) || /mm:/.test(code);
      custom[f.getAttribute('numFmtId')] = tieneFecha && tieneHora ? 'dt' : tieneFecha ? 'd' : tieneHora ? 't' : null;
    });
    const cellXfs = doc.getElementsByTagName('cellXfs')[0];
    if (!cellXfs) return [];
    return [...cellXfs.getElementsByTagName('xf')].map(xf => {
      const id = xf.getAttribute('numFmtId');
      return custom[id] !== undefined ? custom[id] : (FECHA[id] || null);
    });
  },

  _hoja(doc, compartidas, formatos) {
    const filas = [];
    [...doc.getElementsByTagName('row')].forEach(row => {
      const idx = parseInt(row.getAttribute('r'), 10);
      const destino = isFinite(idx) ? idx - 1 : filas.length;
      const arr = filas[destino] || (filas[destino] = []);
      [...row.getElementsByTagName('c')].forEach(c => {
        const ref = c.getAttribute('r') || '';
        const col = Sheets._col(ref);
        const t = c.getAttribute('t');
        let valor = null;

        if (t === 'inlineStr') {
          const is = c.getElementsByTagName('is')[0];
          valor = is ? [...is.getElementsByTagName('t')].map(n => n.textContent).join('') : '';
        } else {
          const v = c.getElementsByTagName('v')[0];
          const crudo = v ? v.textContent : null;
          if (crudo === null) valor = '';
          else if (t === 's') valor = compartidas[parseInt(crudo, 10)] != null ? compartidas[parseInt(crudo, 10)] : '';
          else if (t === 'str') valor = crudo;
          else if (t === 'b') valor = crudo === '1' ? 'VERDADERO' : 'FALSO';
          else if (t === 'e') valor = '';
          else {
            const n = parseFloat(crudo);
            const tipo = formatos[parseInt(c.getAttribute('s') || '0', 10)];
            if (isFinite(n) && tipo) valor = Sheets._fechaExcel(n, tipo);
            else valor = isFinite(n) ? n : crudo;
          }
        }
        arr[col >= 0 ? col : arr.length] = valor;
      });
    });
    // Compacta huecos y descarta filas totalmente vacías
    return filas.map(f => { const a = f || []; for (let i = 0; i < a.length; i++) if (a[i] === undefined) a[i] = ''; return a; })
                .filter(f => f.some(c => String(c == null ? '' : c).trim() !== ''));
  },

  _fechaExcel(serial, tipo) {
    if (tipo === 't') return U.hhmm(Math.round((serial % 1) * 1440));
    const d = U.excelDate(serial);
    const iso = U.iso(d);
    if (tipo === 'dt' && (d.getHours() || d.getMinutes())) {
      return iso + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    return iso;
  },

  /** "BC12" -> índice de columna 0-based */
  _col(ref) {
    const m = String(ref).match(/^([A-Z]+)/i);
    if (!m) return -1;
    let n = 0;
    for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  },

  /* ------------------------- Descompresión ZIP --------------------------- */
  async _unzip(buffer) {
    const dv = new DataView(buffer);
    const u8 = new Uint8Array(buffer);
    const salida = {};

    // Localiza el End Of Central Directory
    let eocd = -1;
    for (let i = dv.byteLength - 22; i >= Math.max(0, dv.byteLength - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('El archivo está dañado o no es un .xlsx.');

    const total = dv.getUint16(eocd + 10, true);
    let ptr = dv.getUint32(eocd + 16, true);

    const pendientes = [];
    for (let i = 0; i < total; i++) {
      if (dv.getUint32(ptr, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(ptr + 10, true);
      const compSize = dv.getUint32(ptr + 20, true);
      const nameLen = dv.getUint16(ptr + 28, true);
      const extraLen = dv.getUint16(ptr + 30, true);
      const commLen = dv.getUint16(ptr + 32, true);
      const offset = dv.getUint32(ptr + 42, true);
      const nombre = new TextDecoder('utf-8').decode(u8.subarray(ptr + 46, ptr + 46 + nameLen));
      ptr += 46 + nameLen + extraLen + commLen;

      if (nombre.slice(-1) === '/') continue;
      if (!/^(xl\/|docProps\/)/.test(nombre)) continue;         // solo lo que necesitamos

      // Encabezado local: los tamaños de nombre/extra pueden diferir del central
      const lnLen = dv.getUint16(offset + 26, true);
      const leLen = dv.getUint16(offset + 28, true);
      const ini = offset + 30 + lnLen + leLen;
      const datos = u8.subarray(ini, ini + compSize);
      pendientes.push({ nombre, metodo, datos });
    }

    for (const p of pendientes) {
      if (p.metodo === 0) salida[p.nombre] = p.datos;
      else if (p.metodo === 8) salida[p.nombre] = await Sheets._inflate(p.datos);
    }
    return salida;
  },

  async _inflate(datos) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([datos]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
};

/* =========================================================================
   Mapper — asigna las columnas del archivo a los campos del panel
   ========================================================================= */
const Mapper = {
  ctx: null,

  /**
   * @param {object} cfg
   *   host      id del contenedor
   *   libro     resultado de Sheets.leer
   *   campos    [{key,label,req,ayuda,alias:[...],tipo}]
   *   camposDe  (opcional) fn(cabeceras) -> campos extra detectados en la hoja
   *   filtroFechas (bool) muestra la lista de fechas encontradas para elegir cuáles importar
   *   onImportar(mapeo, filas, opciones)
   */
  abrir(cfg) {
    Mapper.ctx = cfg;
    Mapper.ctx.hoja = Mapper.mejorHoja(cfg);
    Mapper.pintar();
  },

  /**
   * Elige la hoja que mejor encaja con los campos pedidos: gana la que asigna
   * todos los campos obligatorios, no la que tiene más columnas parecidas.
   * Así una hoja de resumen o el maestro de personal no le ganan a la malla.
   */
  mejorHoja(cfg) {
    let mejor = 0, mejorPunt = -Infinity;
    cfg.libro.hojas.forEach((h, i) => {
      const hIdx = Mapper._headerIdxDe(h.filas);
      const cab = (h.filas[hIdx] || []).map(c => String(c == null ? '' : c).trim());
      const base = cfg.campos || [];
      const extra = cfg.camposDe ? (cfg.camposDe(cab) || []) : [];
      const auto = Mapper.autoAsignar(cab, base.concat(extra));

      let punt = 0, faltanReq = 0;
      base.forEach(c => {
        const asignado = auto[c.key] != null;
        if (c.req) { if (asignado) punt += 10; else faltanReq++; }
        else if (asignado) punt += 3;
      });
      extra.forEach(c => { if (auto[c.key] != null) punt += 0.5; });   // las pausas suman poco
      punt -= faltanReq * 40;                                          // sin los obligatorios no sirve
      punt += Math.min(20, Math.log10(Math.max(1, h.filas.length - hIdx)) * 9);   // la malla real es la hoja con datos

      if (punt > mejorPunt) { mejorPunt = punt; mejor = i; }
    });
    return mejor;
  },

  cerrar() {
    if (!Mapper.ctx) return;
    const host = document.getElementById(Mapper.ctx.host);
    host.classList.remove('is-open'); host.innerHTML = '';
    Mapper.ctx = null;
  },

  cambiarHoja(i) { Mapper.ctx.hoja = +i; Mapper.pintar(); },

  /**
   * Asigna cada campo a la columna cuyo encabezado más se le parece.
   * Prioriza las coincidencias exactas: primero se reparten los nombres idénticos
   * y solo después las coincidencias parciales, para que "Turno_Ini" no se lleve
   * la columna que le corresponde a "Des_1_Ini".
   */
  autoAsignar(cabeceras, campos) {
    const norm = cabeceras.map(U.norm);
    const auto = {}, usadas = new Set();

    const puntuar = (alias, n) => {
      let punt = 0;
      alias.forEach(a => {
        if (!a || !n) return;
        if (n === a) punt = Math.max(punt, 100);
        else if (n.indexOf(a) === 0 || a.indexOf(n) === 0) punt = Math.max(punt, 70);
        else if (n.indexOf(a) > -1 || a.indexOf(n) > -1) punt = Math.max(punt, 50);
      });
      return punt;
    };

    [100, 70, 50].forEach(umbral => {
      campos.forEach(campo => {
        if (auto[campo.key] != null) return;
        const alias = [campo.key, campo.label].concat(campo.alias || []).map(U.norm);
        let mejor = -1, mejorPunt = 0;
        norm.forEach((n, i) => {
          if (usadas.has(i) || !n) return;
          const p = puntuar(alias, n);
          if (p >= umbral && p > mejorPunt) { mejorPunt = p; mejor = i; }
        });
        if (mejor > -1) { auto[campo.key] = mejor; usadas.add(mejor); }
      });
    });
    return auto;
  },

  _filas() {
    const h = Mapper.ctx.libro.hojas[Mapper.ctx.hoja];
    return h ? h.filas : [];
  },

  /** Elige la fila de encabezados: la primera con al menos 2 celdas con texto. */
  _headerIdx(filas) { return Mapper._headerIdxDe(filas); },
  _headerIdxDe(filas) {
    for (let i = 0; i < Math.min(filas.length, 12); i++) {
      const llenas = (filas[i] || []).filter(c => String(c == null ? '' : c).trim() !== '').length;
      if (llenas >= 2) return i;
    }
    return 0;
  },

  pintar() {
    const cfg = Mapper.ctx;
    const host = document.getElementById(cfg.host);
    const filas = Mapper._filas();
    const hIdx = Mapper._headerIdx(filas);
    const cabeceras = (filas[hIdx] || []).map((c, i) => String(c == null ? '' : c).trim() || ('Columna ' + (i + 1)));
    cfg.headerIdx = hIdx;

    // Campos que dependen de los encabezados de esta hoja (por ejemplo, pausas Des_1, Lunch…)
    cfg.campos = (cfg.camposBase || cfg.campos).slice();
    if (!cfg.camposBase) cfg.camposBase = cfg.campos.slice();
    if (cfg.camposDe) cfg.campos = cfg.camposBase.concat(cfg.camposDe(cabeceras) || []);

    const auto = Mapper.autoAsignar(cabeceras, cfg.campos);
    cfg.auto = auto;

    const selectorHoja = cfg.libro.hojas.length > 1
      ? '<div class="field" style="max-width:240px;margin-bottom:10px"><label>Hoja del archivo</label><select onchange="Mapper.cambiarHoja(this.value)">' +
        cfg.libro.hojas.map((h, i) => '<option value="' + i + '"' + (i === cfg.hoja ? ' selected' : '') + '>' + U.esc(h.nombre) + ' (' + h.filas.length + ' filas)</option>').join('') +
        '</select></div>'
      : '';

    const opciones = '<option value="-1">— No importar —</option>' +
      cabeceras.map((h, i) => '<option value="' + i + '">' + U.esc(h) + '</option>').join('');

    const campos = cfg.campos.map(c =>
      '<div class="field"><label>' + U.esc(c.label) + (c.req ? ' *' : '') + '</label>' +
      '<select data-campo="' + c.key + '">' + opciones + '</select>' +
      (c.ayuda ? '<span class="hint">' + U.esc(c.ayuda) + '</span>' : '') + '</div>').join('');

    const previa = filas.slice(hIdx, hIdx + 6);
    const tabla = '<table class="preview"><thead><tr>' + cabeceras.map(h => '<th>' + U.esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
      previa.slice(1).map(f => '<tr>' + cabeceras.map((_, i) => '<td>' + U.esc(f[i] == null ? '' : f[i]) + '</td>').join('') + '</tr>').join('') +
      '</tbody></table>';

    const reconocidos = Object.keys(auto).length;
    host.innerHTML =
      '<div class="mapper__box">' +
        '<div class="mapper__title">Revisa la lectura del archivo</div>' +
        '<p class="hint">' + U.esc(cfg.libro.nombre) +
          (cfg.libro.hojas.length > 1 ? ' · hoja <strong>' + U.esc(cfg.libro.hojas[cfg.hoja].nombre) + '</strong>' : '') +
          ' · ' + (filas.length - hIdx - 1) + ' filas de datos · ' +
          '<strong>' + reconocidos + ' de ' + cfg.campos.length + ' columnas reconocidas automáticamente</strong>.</p>' +
        selectorHoja +
        '<div class="preview-wrap">' + tabla + '</div>' +
        '<div class="mapper__grid">' + campos + '</div>' +
        '<div id="mapperFechas"></div>' +
        (cfg.extra || '') +
        '<div class="stack">' +
          '<button class="btn btn--primary btn--sm" type="button" onclick="Mapper.importar()">Importar datos</button>' +
          '<button class="btn btn--ghost btn--sm" type="button" onclick="Mapper.cerrar()">Cancelar</button>' +
        '</div>' +
      '</div>';
    host.classList.add('is-open');

    host.querySelectorAll('select[data-campo]').forEach(sel => {
      const k = sel.dataset.campo;
      sel.value = auto[k] != null ? auto[k] : -1;
      if (k === 'fecha') sel.addEventListener('change', Mapper.pintarFechas);
    });
    if (cfg.filtroFechas) Mapper.pintarFechas();
    host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  /** Lista las fechas encontradas para elegir cuáles importar. */
  pintarFechas() {
    const cfg = Mapper.ctx;
    if (!cfg || !cfg.filtroFechas) return;
    const host = document.getElementById(cfg.host);
    const caja = document.getElementById('mapperFechas');
    if (!caja) return;
    const sel = host.querySelector('select[data-campo="fecha"]');
    const col = sel ? +sel.value : -1;
    if (col < 0) { caja.innerHTML = ''; return; }

    const filas = Mapper._filas().slice(cfg.headerIdx + 1);
    const cuenta = {};
    filas.forEach(f => { const d = U.parseFecha(f[col]); if (d) cuenta[d] = (cuenta[d] || 0) + 1; });
    const fechas = Object.keys(cuenta).sort();
    if (!fechas.length) { caja.innerHTML = '<p class="hint">No se reconocieron fechas en esa columna.</p>'; return; }

    caja.innerHTML =
      '<div style="margin:6px 0 2px"><strong style="font-size:13px">¿Qué días quieres cargar?</strong> ' +
      '<button class="link-btn" type="button" onclick="Mapper.marcarFechas(true)">Todos</button>' +
      '<button class="link-btn" type="button" onclick="Mapper.marcarFechas(false)">Ninguno</button></div>' +
      '<div class="chipset" style="margin-bottom:6px">' +
      fechas.map(f => '<label class="chip" style="cursor:pointer;display:inline-flex;gap:6px;align-items:center">' +
        '<input type="checkbox" data-fecha="' + f + '" checked style="width:auto;margin:0"> ' +
        U.fechaCorta(f) + ' <span style="opacity:.7">(' + cuenta[f] + ')</span></label>').join('') +
      '</div>';
  },

  marcarFechas(v) {
    document.querySelectorAll('#mapperFechas input[data-fecha]').forEach(c => { c.checked = v; });
  },

  importar() {
    const cfg = Mapper.ctx;
    const host = document.getElementById(cfg.host);
    const mapeo = {};
    host.querySelectorAll('select[data-campo]').forEach(s => { const v = +s.value; if (v >= 0) mapeo[s.dataset.campo] = v; });

    const faltan = cfg.campos.filter(c => c.req && mapeo[c.key] == null).map(c => c.label);
    if (faltan.length) { App.toast('Faltan columnas obligatorias', faltan.join(', '), 'bad'); return; }

    const filas = Mapper._filas().slice(cfg.headerIdx + 1);
    const opciones = {};
    host.querySelectorAll('[data-opcion]').forEach(el => { opciones[el.dataset.opcion] = el.type === 'checkbox' ? el.checked : el.value; });

    const casillas = [...host.querySelectorAll('#mapperFechas input[data-fecha]')];
    if (casillas.length) {
      opciones.fechas = casillas.filter(c => c.checked).map(c => c.dataset.fecha);
      if (!opciones.fechas.length) { App.toast('Selecciona al menos un día', '', 'bad'); return; }
    }
    cfg.onImportar(mapeo, filas, opciones);
  }
};
