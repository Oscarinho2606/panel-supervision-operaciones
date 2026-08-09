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
  version: 0,            // versión del estado en el servidor, para no pisar cambios ajenos
  servidorPor: '',

  /** ¿El panel se está sirviendo desde el servidor con base de datos? */
  async probarServidor() {
    if (location.protocol === 'file:') return false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const r = await fetch('api/info', { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (!r.ok) return false;
      const info = await r.json();
      return !!info.ok;
    } catch (e) { return false; }
  },

  async abrir() {
    if (await Store.probarServidor()) { Store.modo = 'servidor'; return Store.modo; }
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
    if (this.modo === 'servidor') {
      if (store === 'files') {
        await fetch('api/archivo/' + encodeURIComponent(key), {
          method: 'PUT',
          headers: { 'Content-Type': val.type || 'application/pdf', 'X-Nombre': encodeURIComponent(val.name || '') },
          body: val
        });
        return true;
      }
      const r = await fetch('api/estado', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: Store.version, datos: val })
      });
      if (r.status === 409) {
        // Otro equipo guardó mientras tanto: se avisa y se recarga lo suyo
        const otro = await r.json();
        Store.version = otro.version;
        throw new Error('Otro equipo (' + (otro.actualizadoPor || 'desconocido') + ') guardó cambios. Recarga la página para verlos.');
      }
      if (!r.ok) throw new Error('El servidor rechazó el guardado');
      Store.version = (await r.json()).version;
      return true;
    }
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
    if (this.modo === 'servidor') {
      if (store === 'files') {
        const r = await fetch('api/archivo/' + encodeURIComponent(key));
        return r.ok ? await r.blob() : undefined;
      }
      const r = await fetch('api/estado', { cache: 'no-store' });
      if (!r.ok) return undefined;
      const info = await r.json();
      Store.version = info.version;
      Store.servidorPor = info.actualizadoPor || '';
      return info.datos && Object.keys(info.datos).length ? info.datos : undefined;
    }
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
    if (this.modo === 'servidor') {
      if (store === 'files') await fetch('api/archivo/' + encodeURIComponent(key), { method: 'DELETE' });
      return true;
    }
    if (this.modo === 'indexeddb') {
      return new Promise((res) => { const r = this._tx(store, 'readwrite').delete(key); r.onsuccess = () => res(true); r.onerror = () => res(false); });
    }
    if (this.modo === 'localstorage') { localStorage.removeItem('po:' + store + ':' + key); return true; }
    delete this.mem[store + ':' + key]; return true;
  },

  async limpiar() {
    if (this.modo === 'servidor') {
      await Store.set('kv', 'state', {});
      return;
    }
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
/* Los indicadores no vienen predefinidos: se crean al cargar el informe, que
   trae el nombre y la meta de cada uno. Esta lista es solo para los datos de
   ejemplo de la pestaña Ajustes. */
const INDICADORES_DEMO = [
  { id: 'llamadas',   nombre: 'Gestiones atendidas', unidad: 'num', meta: 60,  direccion: 'up',   peso: 1, activo: true },
  { id: 'tmo',        nombre: 'TMO',                 unidad: 'seg', meta: 330, direccion: 'down', peso: 1, activo: true },
  { id: 'calidad',    nombre: 'Calidad',             unidad: 'pct', meta: 92,  direccion: 'up',   peso: 1.5, activo: true },
  { id: 'adherencia', nombre: 'Adherencia',          unidad: 'pct', meta: 95,  direccion: 'up',   peso: 1, activo: true },
  { id: 'csat',       nombre: 'Satisfacción (CSAT)', unidad: 'pct', meta: 90,  direccion: 'up',   peso: 1, activo: true },
  { id: 'conversion', nombre: 'Conversión',          unidad: 'pct', meta: 25,  direccion: 'up',   peso: 1, activo: true }
];

const State = {
  meta: { titulo: 'Panel de Supervisión', subtitulo: 'Operaciones · Rendimiento, Turnos y Conocimiento', tema: 'light' },
  indicadores: [],
  registros: [],
  turnos: [],
  requerido: {},              // { 'skill||HH:MM': cantidad }
  conocimientos: [],
  ui: { agentesSel: [], vista: 'rendimiento', tabs: {} }
};

/* ------------------------------- Aplicación ------------------------------ */
const App = {
  listo: false,

  rol: 'editor',        // sin servidor, quien abre el panel manda sobre sus datos

  /* --------------------------- Acceso ------------------------------------ */
  /** Con servidor, hay que entrar con contraseña antes de ver nada. */
  async pedirAcceso() {
    try {
      const r = await fetch('api/sesion', { cache: 'no-store' });
      const s = await r.json();
      if (s.autenticado) { App.rol = s.rol; return true; }
    } catch (e) { /* sin servidor no hay acceso que pedir */ }
    document.getElementById('login').hidden = false;
    return false;
  },

  async entrar(ev) {
    ev.preventDefault();
    const clave = document.getElementById('loginClave').value;
    const error = document.getElementById('loginError');
    error.hidden = true;
    try {
      const r = await fetch('api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: clave })
      });
      const res = await r.json();
      if (!r.ok) { error.textContent = res.error || 'No se pudo entrar'; error.hidden = false; return; }
      document.getElementById('login').hidden = true;
      location.reload();
    } catch (e) {
      error.textContent = 'No se pudo conectar con el servidor'; error.hidden = false;
    }
  },

  async salir() {
    await fetch('api/salir', { method: 'POST' });
    location.reload();
  },

  /** Deja el panel en modo consulta: se ocultan las acciones que modifican. */
  aplicarRol() {
    document.body.classList.toggle('rol-consulta', App.rol !== 'editor');
    if (Store.modo !== 'servidor') return;
    const acciones = document.querySelector('.app-bar__actions');
    if (acciones && !document.getElementById('pillRol')) {
      acciones.insertAdjacentHTML('afterbegin',
        '<span class="pill-rol" id="pillRol">' +
        (App.rol === 'editor' ? '✎ Puedes cargar' : '👁 Solo consulta') + '</span>' +
        '<button class="btn btn--ghost" type="button" onclick="App.salir()" title="Cerrar la sesión">Salir</button>');
    }
    // En modo consulta, la pestaña activa puede ser una que ya no se ve
    if (App.rol !== 'editor') {
      for (const vista in State.ui.tabs) {
        const btn = document.querySelector('#view-' + vista + ' .tab-btn[data-tab="' + State.ui.tabs[vista] + '"]');
        if (btn && btn.hasAttribute('data-editor')) delete State.ui.tabs[vista];
      }
    }
  },

  async init() {
    document.body.classList.add('sin-animacion');
    const modo = await Store.abrir();
    if (modo === 'servidor' && !(await App.pedirAcceso())) return;
    const guardado = await Store.get('kv', 'state');
    if (guardado) {
      Object.assign(State, guardado);
      if (!State.ui) State.ui = { agentesSel: [], vista: 'rendimiento', tabs: {} };
      if (!State.indicadores) State.indicadores = [];
    }
    App.aplicarTema(State.meta.tema);
    App.pintarIdentidad();
    App.aplicarRol();

    const pill = document.getElementById('storagePill');
    pill.textContent = modo === 'servidor' ? '🗄 Compartido en la base de datos'
      : modo === 'indexeddb' ? '💾 Guardado solo en este equipo'
      : modo === 'localstorage' ? '💾 Guardado (modo básico)' : '⚠ Sin guardado permanente';
    pill.title = modo === 'servidor'
      ? 'Todo se guarda en PostgreSQL: cualquiera que abra esta dirección ve la misma información.'
      : modo === 'indexeddb'
        ? 'La información queda en este navegador. Para que otros la vean, abre el panel desde el servidor.'
        : modo === 'localstorage'
          ? 'Se usa almacenamiento básico: los PDF grandes pueden no caber. Exporta un respaldo con frecuencia.'
          : 'Este navegador bloqueó el almacenamiento: la información se perderá al cerrar. Exporta un respaldo.';
    if (modo === 'servidor') App.vigilarCambios();

    Rend.init(); Agentes.init(); Turnos.init(); Conocimientos.init();
    App.pintarAjustes();
    App.listo = true;
    const vista = App.vistaDelEnlace() || State.ui.vista || 'rendimiento';
    const tab = App.tabDelEnlace();
    if (tab) State.ui.tabs[vista] = tab;
    App.go(vista, true);
    if (tab) App.tab(vista, tab);
    Demo.autoSiVacio();
    requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('sin-animacion')));

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') App.cerrarModal();
    });
    window.addEventListener('resize', U.debounce(() => App.repintar(), 220));
  },

  /** Permite enlazar una sección directa: index.html#turnos o #demo,agentes */
  vistaDelEnlace() {
    const partes = String(location.hash || '').replace('#', '').split(/[,&]/);
    const vistas = ['rendimiento', 'agentes', 'turnos', 'conocimientos', 'ajustes'];
    return partes.map(p => p.trim()).find(p => vistas.indexOf(p) > -1) || null;
  },

  /** Y también una pestaña concreta: #rendimiento,r-ranking */
  tabDelEnlace() {
    const partes = String(location.hash || '').replace('#', '').split(/[,&]/).map(p => p.trim());
    return partes.find(p => p && document.getElementById('tab-' + p)) || null;
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
    catch (e) {
      App.toast('No se pudo guardar', e.message ||
        'El navegador rechazó el almacenamiento. Exporta un respaldo desde Ajustes.', 'bad');
    }
  },

  /**
   * Con base de datos, varios equipos consultan a la vez. Cada 15 segundos se
   * comprueba si alguien guardó algo nuevo y se ofrece traerlo.
   */
  vigilarCambios() {
    let avisando = false;
    setInterval(async () => {
      if (avisando || document.hidden) return;
      try {
        const r = await fetch('api/version', { cache: 'no-store' });
        if (!r.ok) return;
        const info = await r.json();
        if (info.version === Store.version) return;
        avisando = true;
        const cont = document.getElementById('toasts');
        const el = document.createElement('div');
        el.className = 'toast toast--ok';
        el.innerHTML = '<strong>Hay información nueva</strong>' +
          (info.actualizadoPor ? 'Cargada desde ' + U.esc(info.actualizadoPor) + '. ' : '') +
          '<button class="btn btn--primary btn--sm" style="margin-top:8px" onclick="location.reload()">Actualizar</button>';
        cont.appendChild(el);
      } catch (e) { /* el servidor puede estar reiniciándose */ }
    }, 15000);
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
    State.indicadores = [];
    State.ui = { agentesSel: [], vista: 'rendimiento', tabs: {} };
    await App.guardarYa();
    Rend.init(); Agentes.init(); Turnos.init(); Conocimientos.init();
    App.repintar(); App.pintarAjustes();
    App.toast('Información eliminada', '', 'ok');
  },

  cargarDemo() { Demo.cargar(); },

  /** Ficha de la base de datos compartida (solo cuando el panel corre en el servidor). */
  async pintarServidor() {
    const card = document.getElementById('ajServidorCard');
    if (!card) return;
    if (Store.modo !== 'servidor') { card.hidden = true; return; }
    card.hidden = false;
    try {
      const info = await (await fetch('api/info', { cache: 'no-store' })).json();
      const filas = [
        ['Dirección para el equipo', location.origin],
        ['Base de datos', info.base],
        ['Tamaño de la base', info.tamano_bd],
        ['Documentos PDF', info.archivos + ' (' + U.peso(Number(info.peso_archivos)) + ')'],
        ['Última carga', info.actualizado ? new Date(info.actualizado).toLocaleString('es-CO') : '—'],
        ['Hecha desde', info.por || '—'],
        ['Copias de seguridad guardadas', info.copias]
      ];
      document.getElementById('ajServidor').innerHTML = '<table class="data"><tbody>' +
        filas.map(f => '<tr><td>' + f[0] + '</td><td class="num"><strong>' + U.esc(String(f[1])) + '</strong></td></tr>').join('') +
        '</tbody></table>';
    } catch (e) {
      document.getElementById('ajServidor').innerHTML = '<div class="empty">No se pudo consultar el servidor.</div>';
    }
  },

  copiarDireccion() {
    const dir = location.origin;
    navigator.clipboard.writeText(dir)
      .then(() => App.toast('Dirección copiada', dir + ' — pásala a tu equipo por chat o correo.', 'ok'))
      .catch(() => App.toast('Copia esta dirección', dir, 'ok'));
  },

  pintarAjustes() {
    App.pintarServidor();
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

  /** Los skills de la operación salen de la malla; los registros solo completan. */
  skills() {
    const s = new Set();
    State.turnos.forEach(t => t.skill && s.add(t.skill));
    State.registros.forEach(r => r.skill && s.add(r.skill));
    return [...s].sort((a, b) => a.localeCompare(b, 'es'));
  },

  /**
   * Skill al que pertenece un agente. Manda la malla de turnos, porque es donde
   * queda registrado el segmento en el que está programado; si no aparece en la
   * malla, se usa el skill de sus registros de rendimiento.
   */
  skillDeAgente(nombre) {
    const contar = lista => {
      const c = {};
      lista.forEach(x => { if (x.agente === nombre && x.skill) c[x.skill] = (c[x.skill] || 0) + 1; });
      const claves = Object.keys(c);
      return claves.length ? claves.sort((a, b) => c[b] - c[a])[0] : null;
    };
    return contar(State.turnos) || contar(State.registros) || 'Sin skill';
  },

  /** Todos los skills en los que aparece el agente (malla y registros). */
  skillsDeAgente(nombre) {
    const s = new Set();
    State.turnos.forEach(t => { if (t.agente === nombre && t.skill) s.add(t.skill); });
    State.registros.forEach(r => { if (r.agente === nombre && r.skill) s.add(r.skill); });
    return [...s];
  },

  indicadoresActivos() { return State.indicadores.filter(m => m.activo !== false); },
  indicador(id) { return State.indicadores.find(m => m.id === id); },

  /** ¿Este indicador tiene algún valor cargado? */
  tieneDatos(id) { return State.registros.some(r => r.valores && r.valores[id] != null); },

  /**
   * Indicadores que aparecen en ese conjunto de registros. Cada skill mide cosas
   * distintas (INB tiene AHT y FCR, RRSS tiene TMR…), así que las tablas solo
   * deben mostrar las columnas que ese grupo realmente usa.
   */
  indicadoresConDatos(registros) {
    return App.indicadoresActivos().filter(m =>
      registros.some(r => r.valores && r.valores[m.id] != null));
  },

  /** El primero que sí tenga datos: evita que los gráficos arranquen en blanco. */
  primerIndicadorConDatos() {
    const act = App.indicadoresActivos();
    return act.find(m => m.meta != null && App.tieneDatos(m.id)) || act.find(m => App.tieneDatos(m.id)) || act[0] || null;
  },

  /**
   * Cumplimiento de un valor contra su meta, de 0 a 1.
   * Se tope en 1: superar la meta cuenta como cumplida, no aporta de más. Así el
   * puntaje global nunca pasa del 100 %, igual que en el informe de la campaña.
   */
  cumplimiento(valor, ind, meta) {
    const m = meta == null ? (ind && ind.meta) : meta;
    if (valor == null || !isFinite(valor) || !ind || m == null || !isFinite(m)) return null;
    // Meta cero: es un "no debe haber ninguno" (errores, ausentismo). Se cumple o no.
    if (m === 0) {
      if (ind.direccion === 'down') return valor <= 0 ? 1 : 0;
      return valor > 0 ? 1 : 0;
    }
    const r = ind.direccion === 'down'
      ? (valor <= 0 ? 1 : m / valor)
      : valor / m;
    return U.clamp(r, 0, 1);
  },

  /** Meta de un indicador para un registro concreto: manda la que trae el informe. */
  metaDe(reg, ind) {
    return (reg && reg.metas && reg.metas[ind.id] != null) ? reg.metas[ind.id] : ind.meta;
  },

  /** Meta representativa de un conjunto de registros (promedia las individuales). */
  metaProm(registros, ind) {
    const v = (registros || []).map(r => App.metaDe(r, ind)).filter(x => x != null && isFinite(x));
    return v.length ? U.prom(v) : ind.meta;
  },

  estadoCumplimiento(c) {
    if (c == null) return { clase: '', etiqueta: 'Sin dato', color: 'var(--ink-muted)' };
    if (c >= 1) return { clase: 'badge--ok', etiqueta: 'Cumple', color: 'var(--ok)' };
    if (c >= 0.9) return { clase: 'badge--warn', etiqueta: 'Cerca', color: 'var(--warn)' };
    return { clase: 'badge--bad', etiqueta: 'Bajo', color: 'var(--bad)' };
  },

  /** Puntaje global ponderado de 0 a 100 de un conjunto de registros. */
  puntaje(registros) {
    const inds = App.indicadoresActivos();
    let suma = 0, pesos = 0;
    inds.forEach(ind => {
      const conDato = registros.filter(r => r.valores && r.valores[ind.id] != null && isFinite(r.valores[ind.id]));
      if (!conDato.length) return;
      // Cada registro se compara con su propia meta y luego se promedia
      const cumpl = conDato.map(r => App.cumplimiento(r.valores[ind.id], ind, App.metaDe(r, ind))).filter(c => c != null);
      if (!cumpl.length) return;
      const p = Number(ind.peso) || 1;
      suma += U.prom(cumpl) * p; pesos += p;
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
