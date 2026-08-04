/* =========================================================================
   core.js — Estado, almacenamiento local, navegación y utilidades comunes
   Todo vive en el navegador del usuario: nada se envía a ningún servidor.
   ========================================================================= */

'use strict';

/* ------------------------------- Utilidades ------------------------------ */
const U = {
  uid(p) { return (p || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

  /** Texto normalizado (sin acentos, minúsculas) para búsquedas y auto-mapeo. */
  norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  },

  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  /** Escapa un texto para usarlo dentro de un literal JS en un atributo onclick.
      Nombres como "D'Angelo" romperían el atributo si solo se escapara el HTML. */
  js(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  /** Convierte a número admitiendo "1.234,56", "1,234.56", "85 %", "01:05:30". */
  num(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).trim();
    if (!s) return null;
    if (/^-?\d{1,3}:\d{2}(:\d{2})?$/.test(s)) return U.hmsToSec(s);
    s = s.replace(/\s/g, '').replace(/[%$€]/g, '');
    const coma = s.lastIndexOf(','), punto = s.lastIndexOf('.');
    if (coma > -1 && punto > -1) {
      // El separador decimal es el que aparece de último
      s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (coma > -1) {
      s = /,\d{3}$/.test(s) && s.length > 4 ? s.replace(/,/g, '') : s.replace(',', '.');
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  },

  hmsToSec(s) {
    const p = String(s).split(':').map(Number);
    if (p.some(isNaN)) return null;
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return p[0];
  },

  secToHms(sec) {
    if (sec == null || !isFinite(sec)) return '—';
    const neg = sec < 0; sec = Math.round(Math.abs(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p = n => String(n).padStart(2, '0');
    return (neg ? '-' : '') + (h > 0 ? h + ':' + p(m) + ':' + p(s) : p(m) + ':' + p(s));
  },

  /** Formatea un valor según la unidad del indicador. */
  fmt(v, unidad, dec) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    switch (unidad) {
      case 'pct': return U.dec(v, dec == null ? 1 : dec) + ' %';
      case 'seg': return U.secToHms(v);
      case 'min': return U.dec(v, dec == null ? 1 : dec) + ' min';
      case 'moneda': return '$' + U.dec(v, dec == null ? 0 : dec);
      default: return U.dec(v, dec == null ? (Math.abs(v) < 10 && v % 1 !== 0 ? 2 : 0) : dec);
    }
  },

  dec(v, d) {
    return Number(v).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
  },

  /** Versión compacta para tarjetas: 12.400 -> 12,4 K */
  compact(v) {
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e6) return U.dec(v / 1e6, 1) + ' M';
    if (a >= 10000) return U.dec(v / 1000, 1) + ' K';
    return U.dec(v, a % 1 === 0 ? 0 : 1);
  },

  /* --- Fechas --- */
  hoy() { const d = new Date(); return U.iso(d); },
  iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },
  parseFecha(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) return U.iso(v);
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);      // dd/mm/aaaa
    if (m) {
      let y = m[3].length === 2 ? '20' + m[3] : m[3];
      return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    }
    if (/^\d{5,6}(\.\d+)?$/.test(s)) return U.iso(U.excelDate(parseFloat(s)));   // serial de Excel
    const d = new Date(s);
    return isNaN(d) ? '' : U.iso(d);
  },
  excelDate(serial) {
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  },
  addDays(isoStr, n) {
    const [y, m, d] = isoStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n);
    return U.iso(dt);
  },
  fechaCorta(isoStr) {
    if (!isoStr) return '';
    const [y, m, d] = isoStr.split('-').map(Number);
    return String(d).padStart(2, '0') + ' ' + ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][m - 1];
  },
  fechaLarga(isoStr) {
    if (!isoStr) return '';
    const [y, m, d] = isoStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    return dias[dt.getDay()] + ', ' + d + ' de ' +
      ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][m - 1] + ' de ' + y;
  },
  diaSemana(isoStr) {
    const [y, m, d] = isoStr.split('-').map(Number);
    return ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][new Date(y, m - 1, d).getDay()];
  },
  inicioSemana(isoStr) {
    const [y, m, d] = isoStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const off = (dt.getDay() + 6) % 7;                    // lunes como primer día
    return U.addDays(isoStr, -off);
  },

  /* --- Horas --- */
  minutos(hhmm) {
    if (hhmm == null || hhmm === '') return null;
    if (typeof hhmm === 'number') {
      if (hhmm > 0 && hhmm < 1) return Math.round(hhmm * 1440);   // fracción de día (Excel)
      if (hhmm >= 1 && hhmm < 24) return Math.round(hhmm * 60);   // "8" = 8:00
      return Math.round(hhmm);
    }
    const s = String(hhmm).trim();
    let m = s.match(/^(\d{1,2})[:.h](\d{2})/i);
    if (m) {
      let h = +m[1], mi = +m[2];
      if (/p\.?m/i.test(s) && h < 12) h += 12;
      if (/a\.?m/i.test(s) && h === 12) h = 0;
      return h * 60 + mi;
    }
    m = s.match(/^(\d{1,2})\s*(a\.?m|p\.?m)/i);
    if (m) { let h = +m[1]; if (/p/i.test(m[2]) && h < 12) h += 12; if (/a/i.test(m[2]) && h === 12) h = 0; return h * 60; }
    if (/^\d+(\.\d+)?$/.test(s)) return U.minutos(parseFloat(s));
    return null;
  },
  hhmm(min) {
    if (min == null || !isFinite(min)) return '';
    min = ((Math.round(min) % 1440) + 1440) % 1440;
    return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  },

  /* --- Archivos --- */
  peso(bytes) {
    if (!bytes && bytes !== 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  },
  descargar(nombre, contenido, mime) {
    const blob = contenido instanceof Blob ? contenido : new Blob(['﻿' + contenido], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 400);
  },
  csv(filas) {
    return filas.map(f => f.map(c => {
      const s = c == null ? '' : String(c);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\r\n');
  },

  iniciales(nombre) {
    const p = String(nombre || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  },
  prom(arr) {
    const v = arr.filter(x => x != null && isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  },
  suma(arr) {
    const v = arr.filter(x => x != null && isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  },
  clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },
  debounce(fn, ms) { let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(this, a), ms || 250); }; }
};

/* ------------------------------ Almacenamiento --------------------------- */
/* IndexedDB para el estado y los PDF; localStorage como respaldo si el
   navegador bloquea IndexedDB (ocurre al abrir con doble clic en algunos casos). */
const Store = {
  db: null, modo: 'memoria', mem: {},

  async abrir() {
    try {
      this.db = await new Promise((res, rej) => {
        const req = indexedDB.open('panel-operaciones', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
          if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
        };
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
        req.onblocked = () => rej(new Error('bloqueado'));
        setTimeout(() => rej(new Error('tiempo agotado')), 3000);
      });
      this.modo = 'indexeddb';
    } catch (e) {
      try {
        localStorage.setItem('__t', '1'); localStorage.removeItem('__t');
        this.modo = 'localstorage';
      } catch (e2) { this.modo = 'memoria'; }
    }
    return this.modo;
  },

  _tx(store, modo) { return this.db.transaction(store, modo).objectStore(store); },

  async set(store, key, val) {
    if (this.modo === 'indexeddb') {
      return new Promise((res, rej) => {
        const r = this._tx(store, 'readwrite').put(val, key);
        r.onsuccess = () => res(true); r.onerror = () => rej(r.error);
      });
    }
    if (this.modo === 'localstorage') {
      if (val instanceof Blob) val = { __blob: await Store.blobToDataUrl(val), tipo: val.type };
      localStorage.setItem('po:' + store + ':' + key, JSON.stringify(val));
      return true;
    }
    this.mem[store + ':' + key] = val; return true;
  },

  async get(store, key) {
    if (this.modo === 'indexeddb') {
      return new Promise((res, rej) => {
        const r = this._tx(store, 'readonly').get(key);
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    }
    if (this.modo === 'localstorage') {
      const raw = localStorage.getItem('po:' + store + ':' + key);
      if (!raw) return undefined;
      const val = JSON.parse(raw);
      if (val && val.__blob) return Store.dataUrlToBlob(val.__blob, val.tipo);
      return val;
    }
    return this.mem[store + ':' + key];
  },

  async del(store, key) {
    if (this.modo === 'indexeddb') {
      return new Promise((res) => { const r = this._tx(store, 'readwrite').delete(key); r.onsuccess = () => res(true); r.onerror = () => res(false); });
    }
    if (this.modo === 'localstorage') { localStorage.removeItem('po:' + store + ':' + key); return true; }
    delete this.mem[store + ':' + key]; return true;
  },

  async limpiar() {
    if (this.modo === 'indexeddb') {
      await new Promise(res => { const r = this.db.transaction(['kv', 'files'], 'readwrite'); r.objectStore('kv').clear(); r.objectStore('files').clear(); r.oncomplete = () => res(); r.onerror = () => res(); });
    } else if (this.modo === 'localstorage') {
      Object.keys(localStorage).filter(k => k.indexOf('po:') === 0).forEach(k => localStorage.removeItem(k));
    } else { this.mem = {}; }
  },

  blobToDataUrl(blob) {
    return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
  },
  dataUrlToBlob(dataUrl, tipo) {
    const [head, b64] = String(dataUrl).split(',');
    const bin = atob(b64 || '');
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: tipo || (head.match(/:(.*?);/) || [, 'application/pdf'])[1] });
  }
};

/* -------------------------------- Estado --------------------------------- */
const INDICADORES_BASE = [
  { id: 'llamadas',   nombre: 'Gestiones atendidas', unidad: 'num', meta: 60,  direccion: 'up',   peso: 1, activo: true },
  { id: 'tmo',        nombre: 'TMO',                 unidad: 'seg', meta: 330, direccion: 'down', peso: 1, activo: true },
  { id: 'calidad',    nombre: 'Calidad',             unidad: 'pct', meta: 92,  direccion: 'up',   peso: 1.5, activo: true },
  { id: 'adherencia', nombre: 'Adherencia',          unidad: 'pct', meta: 95,  direccion: 'up',   peso: 1, activo: true },
  { id: 'csat',       nombre: 'Satisfacción (CSAT)', unidad: 'pct', meta: 90,  direccion: 'up',   peso: 1, activo: true },
  { id: 'conversion', nombre: 'Conversión',          unidad: 'pct', meta: 25,  direccion: 'up',   peso: 1, activo: true }
];

const State = {
  meta: { titulo: 'Panel de Supervisión', subtitulo: 'Operaciones · Rendimiento, Turnos y Conocimiento', tema: 'light' },
  indicadores: JSON.parse(JSON.stringify(INDICADORES_BASE)),
  registros: [],
  turnos: [],
  requerido: {},              // { 'skill||HH:MM': cantidad }
  conocimientos: [],
  ui: { agentesSel: [], vista: 'rendimiento', tabs: {} }
};

/* ------------------------------- Aplicación ------------------------------ */
const App = {
  listo: false,

  async init() {
    const modo = await Store.abrir();
    const guardado = await Store.get('kv', 'state');
    if (guardado) {
      Object.assign(State, guardado);
      if (!State.ui) State.ui = { agentesSel: [], vista: 'rendimiento', tabs: {} };
      if (!State.indicadores || !State.indicadores.length) State.indicadores = JSON.parse(JSON.stringify(INDICADORES_BASE));
    }
    App.aplicarTema(State.meta.tema);
    App.pintarIdentidad();

    const pill = document.getElementById('storagePill');
    pill.textContent = modo === 'indexeddb' ? '💾 Guardado en este equipo'
      : modo === 'localstorage' ? '💾 Guardado (modo básico)' : '⚠ Sin guardado permanente';
    pill.title = modo === 'indexeddb'
      ? 'La información queda almacenada en este navegador (IndexedDB).'
      : modo === 'localstorage'
        ? 'Se usa almacenamiento básico: los PDF grandes pueden no caber. Exporta un respaldo con frecuencia.'
        : 'Este navegador bloqueó el almacenamiento: la información se perderá al cerrar. Exporta un respaldo.';

    Rend.init(); Agentes.init(); Turnos.init(); Conocimientos.init();
    App.pintarAjustes();
    App.listo = true;
    App.go(State.ui.vista || 'rendimiento', true);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') App.cerrarModal();
    });
    window.addEventListener('resize', U.debounce(() => App.repintar(), 220));
  },

  /* --- Navegación --- */
  go(vista, silencioso) {
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + vista));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('is-active', b.dataset.view === vista));
    State.ui.vista = vista;
    if (!silencioso) App.guardar();
    App.repintar();
    if (!silencioso) window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  tab(vista, tabId) {
    const raiz = document.getElementById('view-' + vista);
    if (!raiz) return;
    raiz.querySelectorAll(':scope > .subnav .tab-btn').forEach(b => b.classList.toggle('is-active', b.dataset.tab === tabId));
    raiz.querySelectorAll(':scope > .tabpanel').forEach(p => p.classList.toggle('is-active', p.id === 'tab-' + tabId));
    State.ui.tabs[vista] = tabId;
    App.guardar();
    App.repintar();
  },

  repintar() {
    if (!App.listo) return;
    const v = State.ui.vista;
    if (v === 'rendimiento') Rend.render();
    else if (v === 'agentes') Agentes.render();
    else if (v === 'turnos') Turnos.render();
    else if (v === 'conocimientos') Conocimientos.render();
    else if (v === 'ajustes') App.pintarAjustes();
  },

  /* --- Tema --- */
  toggleTema() { App.toggleTheme(); },
  toggleTheme() {
    State.meta.tema = State.meta.tema === 'dark' ? 'light' : 'dark';
    App.aplicarTema(State.meta.tema);
    App.guardar();
    App.repintar();
  },
  aplicarTema(t) { document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light'); },

  /* --- Identidad --- */
  pintarIdentidad() {
    document.querySelector('.brand__text strong').textContent = State.meta.titulo;
    document.querySelector('.brand__text span').textContent = State.meta.subtitulo;
    const a = document.getElementById('ajTitulo'), b = document.getElementById('ajSub');
    if (a) a.value = State.meta.titulo;
    if (b) b.value = State.meta.subtitulo;
  },
  setTitulo(v) { State.meta.titulo = v || 'Panel de Supervisión'; document.querySelector('.brand__text strong').textContent = State.meta.titulo; App.guardar(); },
  setSubtitulo(v) { State.meta.subtitulo = v; document.querySelector('.brand__text span').textContent = v; App.guardar(); },

  /* --- Persistencia --- */
  guardar: null,   // se define abajo (debounce)

  async guardarYa() {
    try { await Store.set('kv', 'state', JSON.parse(JSON.stringify(State))); }
    catch (e) { App.toast('No se pudo guardar', 'El navegador rechazó el almacenamiento. Exporta un respaldo desde Ajustes.', 'bad'); }
  },

  /* --- Avisos --- */
  toast(titulo, texto, tipo) {
    const cont = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (tipo === 'bad' ? 'toast--bad' : tipo === 'ok' ? 'toast--ok' : '');
    el.innerHTML = '<strong>' + U.esc(titulo) + '</strong>' + (texto ? U.esc(texto) : '');
    cont.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; el.style.transition = '.3s'; setTimeout(() => el.remove(), 320); }, 4200);
  },

  /* --- Modales --- */
  modal(opts) {
    const raiz = document.getElementById('modalRoot');
    raiz.innerHTML =
      '<div class="modal' + (opts.wide ? ' modal--wide' : '') + '" role="dialog" aria-modal="true">' +
        '<div class="modal__head"><h3 class="modal__title">' + U.esc(opts.titulo) + '</h3>' +
          '<button class="icon-btn" type="button" onclick="App.cerrarModal()" aria-label="Cerrar">✕</button></div>' +
        '<div class="modal__body">' + opts.cuerpo + '</div>' +
        (opts.pie ? '<div class="modal__foot">' + opts.pie + '</div>' : '') +
      '</div>';
    raiz.hidden = false;
    raiz.onclick = e => { if (e.target === raiz) App.cerrarModal(); };
    if (opts.alMostrar) opts.alMostrar(raiz);
    return raiz;
  },
  cerrarModal() {
    const raiz = document.getElementById('modalRoot');
    raiz.hidden = true; raiz.innerHTML = '';
  },
  confirmar(titulo, texto) {
    return new Promise(res => {
      App.modal({
        titulo: titulo,
        cuerpo: '<p style="font-size:14px;color:var(--ink-2)">' + U.esc(texto) + '</p>',
        pie: '<button class="btn btn--ghost" type="button" onclick="App.__conf(false)">Cancelar</button>' +
             '<button class="btn btn--danger" type="button" onclick="App.__conf(true)">Sí, continuar</button>'
      });
      App.__conf = v => { App.cerrarModal(); res(v); };
    });
  },

  /* --- Respaldo --- */
  async exportarRespaldo() {
    const incluirPdf = document.getElementById('bkIncluirPdf').checked;
    const paquete = { version: 1, generado: new Date().toISOString(), state: JSON.parse(JSON.stringify(State)), archivos: {} };
    if (incluirPdf) {
      for (const t of State.conocimientos) {
        for (const p of (t.procesos || [])) {
          for (const f of (p.archivos || [])) {
            const blob = await Store.get('files', f.id);
            if (blob) paquete.archivos[f.id] = await Store.blobToDataUrl(blob);
          }
        }
      }
    }
    U.descargar('respaldo-panel-' + U.hoy() + '.json', JSON.stringify(paquete), 'application/json');
    App.toast('Respaldo generado', 'Guárdalo en un lugar seguro.', 'ok');
  },

  async importarRespaldo(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const paquete = JSON.parse(await file.text());
      if (!paquete.state) throw new Error('formato');
      const ok = await App.confirmar('Restaurar respaldo', 'Se reemplazará toda la información actual del panel por la del archivo. ¿Continuar?');
      if (!ok) { ev.target.value = ''; return; }
      Object.assign(State, paquete.state);
      for (const id in (paquete.archivos || {})) {
        await Store.set('files', id, Store.dataUrlToBlob(paquete.archivos[id]));
      }
      await App.guardarYa();
      App.aplicarTema(State.meta.tema); App.pintarIdentidad();
      Rend.init(); Agentes.init(); Turnos.init(); Conocimientos.init();
      App.repintar(); App.pintarAjustes();
      App.toast('Respaldo restaurado', 'La información quedó cargada.', 'ok');
    } catch (e) {
      App.toast('No se pudo leer el respaldo', 'Verifica que sea el archivo .json generado por el panel.', 'bad');
    }
    ev.target.value = '';
  },

  async borrarTodo() {
    const ok = await App.confirmar('Borrar toda la información', 'Se eliminan registros de rendimiento, mallas, conocimientos y PDF de este equipo. Esta acción no se puede deshacer.');
    if (!ok) return;
    await Store.limpiar();
    State.registros = []; State.turnos = []; State.requerido = {}; State.conocimientos = [];
    State.indicadores = JSON.parse(JSON.stringify(INDICADORES_BASE));
    State.ui = { agentesSel: [], vista: 'rendimiento', tabs: {} };
    await App.guardarYa();
    Rend.init(); Agentes.init(); Turnos.init(); Conocimientos.init();
    App.repintar(); App.pintarAjustes();
    App.toast('Información eliminada', '', 'ok');
  },

  cargarDemo() { Demo.cargar(); },

  pintarAjustes() {
    const host = document.getElementById('ajStats');
    if (!host) return;
    const nArch = State.conocimientos.reduce((a, t) => a + (t.procesos || []).reduce((b, p) => b + (p.archivos || []).length, 0), 0);
    const nProc = State.conocimientos.reduce((a, t) => a + (t.procesos || []).length, 0);
    const filas = [
      ['Registros de rendimiento', State.registros.length],
      ['Agentes distintos', new Set(State.registros.map(r => r.agente)).size],
      ['Indicadores configurados', State.indicadores.filter(m => m.activo).length],
      ['Turnos en la malla', State.turnos.length],
      ['Títulos de conocimiento', State.conocimientos.length],
      ['Procesos documentados', nProc],
      ['Archivos PDF', nArch],
      ['Modo de almacenamiento', Store.modo === 'indexeddb' ? 'IndexedDB' : Store.modo === 'localstorage' ? 'localStorage' : 'Solo memoria']
    ];
    host.innerHTML = '<table class="data"><tbody>' +
      filas.map(f => '<tr><td>' + f[0] + '</td><td class="num"><strong>' + f[1] + '</strong></td></tr>').join('') +
      '</tbody></table>';
  },

  /* --- Datos derivados compartidos --- */
  agentes() {
    const mapa = new Map();
    State.registros.forEach(r => {
      if (!r.agente) return;
      if (!mapa.has(r.agente)) mapa.set(r.agente, { nombre: r.agente, doc: r.doc || '', skills: new Set(), n: 0 });
      const a = mapa.get(r.agente);
      if (r.skill) a.skills.add(r.skill);
      if (r.doc && !a.doc) a.doc = r.doc;
      a.n++;
    });
    State.turnos.forEach(t => {
      if (!t.agente) return;
      if (!mapa.has(t.agente)) mapa.set(t.agente, { nombre: t.agente, doc: '', skills: new Set(), n: 0 });
      if (t.skill) mapa.get(t.agente).skills.add(t.skill);
    });
    return [...mapa.values()].map(a => ({ ...a, skills: [...a.skills] })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  },

  skills() {
    const s = new Set();
    State.registros.forEach(r => r.skill && s.add(r.skill));
    State.turnos.forEach(t => t.skill && s.add(t.skill));
    return [...s].sort((a, b) => a.localeCompare(b, 'es'));
  },

  indicadoresActivos() { return State.indicadores.filter(m => m.activo !== false); },
  indicador(id) { return State.indicadores.find(m => m.id === id); },

  /** Cumplimiento 0..1.5 de un valor contra la meta del indicador. */
  cumplimiento(valor, ind) {
    if (valor == null || !isFinite(valor) || !ind || !ind.meta) return null;
    const r = ind.direccion === 'down'
      ? (valor <= 0 ? 1.5 : ind.meta / valor)
      : valor / ind.meta;
    return U.clamp(r, 0, 1.5);
  },

  estadoCumplimiento(c) {
    if (c == null) return { clase: '', etiqueta: 'Sin dato', color: 'var(--ink-muted)' };
    if (c >= 1) return { clase: 'badge--ok', etiqueta: 'Cumple', color: 'var(--ok)' };
    if (c >= 0.9) return { clase: 'badge--warn', etiqueta: 'Cerca', color: 'var(--warn)' };
    return { clase: 'badge--bad', etiqueta: 'Bajo', color: 'var(--bad)' };
  },

  /** Puntaje global ponderado (0..150) de un conjunto de registros. */
  puntaje(registros) {
    const inds = App.indicadoresActivos();
    let suma = 0, pesos = 0;
    inds.forEach(ind => {
      const vals = registros.map(r => r.valores && r.valores[ind.id]).filter(v => v != null && isFinite(v));
      if (!vals.length) return;
      const c = App.cumplimiento(U.prom(vals), ind);
      if (c == null) return;
      const p = Number(ind.peso) || 1;
      suma += c * p; pesos += p;
    });
    return pesos ? (suma / pesos) * 100 : null;
  }
};

App.guardar = U.debounce(() => App.guardarYa(), 350);

/* Selector de fechas: rellena "desde/hasta" con el rango disponible. */
App.rangoDatos = function (registros) {
  const fechas = registros.map(r => r.fecha).filter(Boolean).sort();
  return { min: fechas[0] || U.hoy(), max: fechas[fechas.length - 1] || U.hoy() };
};
