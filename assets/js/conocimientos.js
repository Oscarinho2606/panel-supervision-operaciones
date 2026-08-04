/* =========================================================================
   conocimientos.js — Base de conocimiento operativa
   Títulos → procesos (subtítulos) → notas + documentos PDF adjuntos.
   Los archivos se guardan en el equipo del usuario, no en internet.
   ========================================================================= */

'use strict';

const Conocimientos = {
  urlActual: null,

  init() { Conocimientos.pintarFiltro(); },

  pintarFiltro() {
    const sel = document.getElementById('cTitulo');
    if (!sel) return;
    const previo = sel.value;
    sel.innerHTML = '<option value="">Todos</option>' +
      State.conocimientos.map(t => '<option value="' + t.id + '">' + U.esc(t.titulo) + '</option>').join('');
    sel.value = previo;
  },

  /* ------------------------------- Búsqueda ------------------------------ */
  coincide(titulo, proceso, texto) {
    if (!texto) return true;
    const campos = [titulo.titulo, titulo.descripcion, proceso.nombre, proceso.notas,
      (proceso.tags || []).join(' '), (proceso.archivos || []).map(a => a.nombre).join(' ')].join(' ');
    return U.norm(campos).indexOf(texto) > -1;
  },

  /* -------------------------------- Render ------------------------------- */
  render() {
    Conocimientos.pintarFiltro();
    const tab = State.ui.tabs.conocimientos || 'c-biblioteca';
    if (tab === 'c-biblioteca') Conocimientos.renderBiblioteca();
    else if (tab === 'c-gestion') Conocimientos.renderGestion();
    else if (tab === 'c-archivos') Conocimientos.renderArchivos();
  },

  renderBiblioteca() {
    const host = document.getElementById('cLibrary');
    const texto = U.norm(document.getElementById('cBuscar').value || '');
    const filtroTitulo = document.getElementById('cTitulo').value;

    if (!State.conocimientos.length) {
      host.innerHTML = '<div class="card"><div class="empty">' +
        '<strong>Todavía no hay conocimiento cargado</strong>' +
        'Crea un título (por ejemplo «Procesos de facturación»), agrégale los procesos que necesites, ' +
        'escribe las notas de cómo se realiza cada uno y adjunta los PDF de soporte.</div>' +
        '<div class="stack" style="justify-content:center"><button class="btn btn--primary" type="button" onclick="Conocimientos.nuevoTitulo()">+ Crear el primer título</button>' +
        '<button class="btn btn--ghost" type="button" onclick="Demo.cargarConocimiento()">Cargar ejemplo</button></div></div>';
      return;
    }

    const titulos = State.conocimientos.filter(t => !filtroTitulo || t.id === filtroTitulo);
    let visibles = 0;
    const html = titulos.map(t => {
      const procesos = (t.procesos || []).filter(p => Conocimientos.coincide(t, p, texto));
      if (texto && !procesos.length && U.norm(t.titulo + ' ' + (t.descripcion || '')).indexOf(texto) < 0) return '';
      visibles++;
      const abierto = texto ? true : t.abierto;
      const nArch = (t.procesos || []).reduce((a, p) => a + (p.archivos || []).length, 0);
      return '<div class="kb-title' + (abierto ? ' is-open' : '') + '">' +
        '<div class="kb-title__head" onclick="Conocimientos.toggleTitulo(\'' + t.id + '\')">' +
          '<span class="kb-title__caret">▶</span>' +
          '<div class="kb-title__name">' + U.esc(t.titulo) +
            (t.descripcion ? '<div class="kb-title__desc">' + U.esc(t.descripcion) + '</div>' : '') + '</div>' +
          '<span class="kb-proc__count">' + (t.procesos || []).length + ' procesos · ' + nArch + ' PDF</span>' +
          '<button class="icon-btn" type="button" title="Agregar proceso" onclick="event.stopPropagation();Conocimientos.nuevoProceso(\'' + t.id + '\')">+</button>' +
        '</div>' +
        '<div class="kb-title__body">' +
          (procesos.length ? procesos.map(p => Conocimientos.procesoHTML(t, p, texto)).join('')
            : '<div class="empty" style="padding:18px">Este título aún no tiene procesos. ' +
              '<button class="link-btn" type="button" onclick="Conocimientos.nuevoProceso(\'' + t.id + '\')">Agregar el primero</button></div>') +
        '</div></div>';
    }).join('');

    host.innerHTML = html || '<div class="card"><div class="empty"><strong>Sin resultados</strong>Ningún proceso coincide con «' +
      U.esc(document.getElementById('cBuscar').value) + '».</div></div>';
  },

  procesoHTML(t, p, texto) {
    const abierto = texto ? true : p.abierto;
    const archivos = p.archivos || [];
    return '<div class="kb-proc' + (abierto ? ' is-open' : '') + '">' +
      '<div class="kb-proc__head" onclick="Conocimientos.toggleProceso(\'' + t.id + '\',\'' + p.id + '\')">' +
        '<span class="kb-proc__dot"></span>' +
        '<div class="kb-proc__name">' + U.esc(p.nombre) +
          ((p.tags || []).length ? ' ' + p.tags.map(g => '<span class="tag">' + U.esc(g) + '</span>').join('') : '') + '</div>' +
        '<span class="kb-proc__count">' + archivos.length + ' PDF</span>' +
        '<button class="icon-btn" type="button" title="Editar proceso" onclick="event.stopPropagation();Conocimientos.editarProceso(\'' + t.id + '\',\'' + p.id + '\')">✎</button>' +
      '</div>' +
      '<div class="kb-proc__body">' +
        (p.notas ? '<div class="kb-notes">' + U.esc(p.notas) + '</div>'
                 : '<div class="kb-notes" style="color:var(--ink-muted);font-style:italic">Sin notas todavía. ' +
                   'Usa el lápiz para escribir cómo se realiza este proceso.</div>') +
        (archivos.length
          ? '<div class="file-list">' + archivos.map(a =>
              '<div class="file-item">' +
                '<div class="file-item__icon">PDF</div>' +
                '<div class="file-item__name" title="' + U.esc(a.nombre) + '">' + U.esc(a.nombre) + '</div>' +
                '<span class="file-item__size">' + U.peso(a.size) + '</span>' +
                '<button class="btn btn--ghost btn--sm" type="button" onclick="Conocimientos.ver(\'' + a.id + '\')">Ver</button>' +
                '<button class="icon-btn" type="button" title="Descargar" onclick="Conocimientos.descargar(\'' + a.id + '\')">⤓</button>' +
                '<button class="icon-btn icon-btn--danger" type="button" title="Eliminar" onclick="Conocimientos.borrarArchivo(\'' + t.id + '\',\'' + p.id + '\',\'' + a.id + '\')">✕</button>' +
              '</div>').join('') + '</div>'
          : '<p class="hint">Sin documentos adjuntos.</p>') +
        '<div class="stack">' +
          '<button class="btn btn--ghost btn--sm" type="button" onclick="document.getElementById(\'up-' + p.id + '\').click()">＋ Adjuntar PDF</button>' +
          '<input type="file" id="up-' + p.id + '" accept="application/pdf,.pdf" multiple hidden onchange="Conocimientos.subir(event,\'' + t.id + '\',\'' + p.id + '\')">' +
        '</div>' +
      '</div></div>';
  },

  toggleTitulo(id) {
    const t = State.conocimientos.find(x => x.id === id);
    if (!t) return;
    t.abierto = !t.abierto;
    App.guardar(); Conocimientos.renderBiblioteca();
  },

  toggleProceso(tid, pid) {
    const t = State.conocimientos.find(x => x.id === tid);
    const p = t && (t.procesos || []).find(x => x.id === pid);
    if (!p) return;
    p.abierto = !p.abierto;
    App.guardar(); Conocimientos.renderBiblioteca();
  },

  /* ------------------------------- Gestión ------------------------------- */
  renderGestion() {
    const host = document.getElementById('cManage');
    if (!State.conocimientos.length) {
      host.innerHTML = '<div class="empty"><strong>Sin títulos</strong>Crea el primero para empezar a documentar tus procesos.</div>';
      return;
    }
    host.innerHTML = State.conocimientos.map((t, i) =>
      '<div class="manage-item">' +
        '<div class="manage-item__head">' +
          '<span class="manage-item__name">' + U.esc(t.titulo) + '</span>' +
          '<span class="hint">' + (t.procesos || []).length + ' procesos</span>' +
          '<button class="icon-btn" type="button" title="Subir" onclick="Conocimientos.mover(' + i + ',-1)">↑</button>' +
          '<button class="icon-btn" type="button" title="Bajar" onclick="Conocimientos.mover(' + i + ',1)">↓</button>' +
          '<button class="btn btn--ghost btn--sm" type="button" onclick="Conocimientos.nuevoProceso(\'' + t.id + '\')">+ Proceso</button>' +
          '<button class="icon-btn" type="button" title="Editar título" onclick="Conocimientos.editarTitulo(\'' + t.id + '\')">✎</button>' +
          '<button class="icon-btn icon-btn--danger" type="button" title="Eliminar título" onclick="Conocimientos.borrarTitulo(\'' + t.id + '\')">✕</button>' +
        '</div>' +
        ((t.procesos || []).length ? '<div class="manage-sub">' + t.procesos.map((p, j) =>
          '<div class="manage-sub__item">' +
            '<span class="kb-proc__dot"></span>' +
            '<span class="manage-sub__name">' + U.esc(p.nombre) + '</span>' +
            '<span class="hint">' + (p.archivos || []).length + ' PDF' + (p.notas ? ' · con notas' : '') + '</span>' +
            '<button class="icon-btn" type="button" title="Subir" onclick="Conocimientos.moverProceso(\'' + t.id + '\',' + j + ',-1)">↑</button>' +
            '<button class="icon-btn" type="button" title="Bajar" onclick="Conocimientos.moverProceso(\'' + t.id + '\',' + j + ',1)">↓</button>' +
            '<button class="icon-btn" type="button" title="Editar" onclick="Conocimientos.editarProceso(\'' + t.id + '\',\'' + p.id + '\')">✎</button>' +
            '<button class="icon-btn icon-btn--danger" type="button" title="Eliminar" onclick="Conocimientos.borrarProceso(\'' + t.id + '\',\'' + p.id + '\')">✕</button>' +
          '</div>').join('') + '</div>' : '<p class="hint" style="margin-top:8px">Sin procesos todavía.</p>') +
      '</div>').join('');
  },

  renderArchivos() {
    const host = document.getElementById('cFiles');
    const filas = [];
    State.conocimientos.forEach(t => (t.procesos || []).forEach(p => (p.archivos || []).forEach(a =>
      filas.push({ t: t.titulo, p: p.nombre, a: a, tid: t.id, pid: p.id }))));
    if (!filas.length) { host.innerHTML = '<div class="empty"><strong>Sin documentos</strong>Adjunta PDF a tus procesos desde la biblioteca.</div>'; return; }
    host.innerHTML = '<table class="data"><thead><tr><th class="no-sort">Documento</th><th class="no-sort">Título</th>' +
      '<th class="no-sort">Proceso</th><th class="num no-sort">Tamaño</th><th class="no-sort">Cargado</th><th class="no-sort"></th></tr></thead><tbody>' +
      filas.map(f => '<tr><td class="name">' + U.esc(f.a.nombre) + '</td><td>' + U.esc(f.t) + '</td><td>' + U.esc(f.p) + '</td>' +
        '<td class="num">' + U.peso(f.a.size) + '</td><td>' + U.fechaCorta(f.a.fecha || '') + '</td>' +
        '<td><button class="btn btn--ghost btn--sm" type="button" onclick="Conocimientos.ver(\'' + f.a.id + '\')">Ver</button> ' +
        '<button class="icon-btn" type="button" title="Descargar" onclick="Conocimientos.descargar(\'' + f.a.id + '\')">⤓</button> ' +
        '<button class="icon-btn icon-btn--danger" type="button" title="Eliminar" onclick="Conocimientos.borrarArchivo(\'' + f.tid + '\',\'' + f.pid + '\',\'' + f.a.id + '\')">✕</button></td></tr>').join('') +
      '</tbody></table>';
  },

  /* ------------------------------- Títulos ------------------------------- */
  nuevoTitulo() { Conocimientos.editarTitulo(null); },

  editarTitulo(id) {
    const t = id ? State.conocimientos.find(x => x.id === id) : { titulo: '', descripcion: '' };
    if (!t) return;
    App.modal({
      titulo: id ? 'Editar título' : 'Nuevo título de conocimiento',
      cuerpo: '<div class="form-grid">' +
        '<div class="field field--full"><label for="ktNombre">Título</label>' +
        '<input type="text" id="ktNombre" value="' + U.esc(t.titulo) + '" placeholder="Ej. Procesos de facturación"></div>' +
        '<div class="field field--full"><label for="ktDesc">Descripción corta</label>' +
        '<input type="text" id="ktDesc" value="' + U.esc(t.descripcion || '') + '" placeholder="Opcional: para qué sirve este grupo de procesos"></div>' +
        '</div><p class="hint" style="margin-top:10px">Dentro de un título puedes crear todos los procesos que necesites, cada uno con sus notas y sus PDF.</p>',
      pie: '<button class="btn btn--ghost" type="button" onclick="App.cerrarModal()">Cancelar</button>' +
           '<button class="btn btn--primary" type="button" onclick="Conocimientos.guardarTitulo(' + (id ? "'" + id + "'" : 'null') + ')">Guardar</button>',
      alMostrar: () => setTimeout(() => document.getElementById('ktNombre').focus(), 60)
    });
  },

  async guardarTitulo(id) {
    const nombre = document.getElementById('ktNombre').value.trim();
    if (!nombre) return App.toast('Escribe un título', '', 'bad');
    const desc = document.getElementById('ktDesc').value.trim();
    if (id) {
      const t = State.conocimientos.find(x => x.id === id);
      t.titulo = nombre; t.descripcion = desc;
    } else {
      State.conocimientos.push({ id: U.uid('kt'), titulo: nombre, descripcion: desc, abierto: true, procesos: [] });
    }
    await App.guardarYa();
    App.cerrarModal();
    Conocimientos.render();
    App.toast('Título guardado', nombre, 'ok');
  },

  async borrarTitulo(id) {
    const t = State.conocimientos.find(x => x.id === id);
    if (!t) return;
    const nArch = (t.procesos || []).reduce((a, p) => a + (p.archivos || []).length, 0);
    const ok = await App.confirmar('Eliminar título', 'Se elimina «' + t.titulo + '» con sus ' + (t.procesos || []).length +
      ' procesos y ' + nArch + ' documentos PDF.');
    if (!ok) return;
    for (const p of (t.procesos || [])) for (const a of (p.archivos || [])) await Store.del('files', a.id);
    State.conocimientos = State.conocimientos.filter(x => x.id !== id);
    await App.guardarYa();
    Conocimientos.render(); App.pintarAjustes();
  },

  async mover(i, d) {
    const j = i + d;
    if (j < 0 || j >= State.conocimientos.length) return;
    const [x] = State.conocimientos.splice(i, 1);
    State.conocimientos.splice(j, 0, x);
    await App.guardarYa();
    Conocimientos.renderGestion();
  },

  /* ------------------------------- Procesos ------------------------------ */
  nuevoProceso(tid) { Conocimientos.editarProceso(tid, null); },

  editarProceso(tid, pid) {
    const t = State.conocimientos.find(x => x.id === tid);
    if (!t) return;
    const p = pid ? (t.procesos || []).find(x => x.id === pid) : { nombre: '', notas: '', tags: [] };
    if (!p) return;
    App.modal({
      titulo: (pid ? 'Editar proceso' : 'Nuevo proceso') + ' · ' + t.titulo,
      cuerpo: '<div class="form-grid">' +
        '<div class="field field--full"><label for="kpNombre">Nombre del proceso (subtítulo)</label>' +
        '<input type="text" id="kpNombre" value="' + U.esc(p.nombre) + '" placeholder="Ej. Cómo generar una nota crédito"></div>' +
        '<div class="field field--full"><label for="kpTags">Etiquetas</label>' +
        '<input type="text" id="kpTags" value="' + U.esc((p.tags || []).join(', ')) + '" placeholder="Separadas por coma. Ej. facturación, cliente nuevo"></div>' +
        '<div class="field field--full"><label for="kpNotas">Notas: cómo se realiza el proceso</label>' +
        '<textarea id="kpNotas" rows="12" placeholder="Escribe el paso a paso, las validaciones, a quién se escala y los tiempos de respuesta.">' + U.esc(p.notas || '') + '</textarea></div>' +
        '</div><p class="hint" style="margin-top:10px">Los PDF se adjuntan desde la biblioteca, en el propio proceso.</p>',
      pie: '<button class="btn btn--ghost" type="button" onclick="App.cerrarModal()">Cancelar</button>' +
           '<button class="btn btn--primary" type="button" onclick="Conocimientos.guardarProceso(\'' + tid + '\',' + (pid ? "'" + pid + "'" : 'null') + ')">Guardar</button>',
      alMostrar: () => setTimeout(() => document.getElementById('kpNombre').focus(), 60)
    });
  },

  async guardarProceso(tid, pid) {
    const t = State.conocimientos.find(x => x.id === tid);
    if (!t) return;
    const nombre = document.getElementById('kpNombre').value.trim();
    if (!nombre) return App.toast('Escribe el nombre del proceso', '', 'bad');
    const notas = document.getElementById('kpNotas').value;
    const tags = document.getElementById('kpTags').value.split(',').map(s => s.trim()).filter(Boolean);
    if (!t.procesos) t.procesos = [];
    if (pid) {
      const p = t.procesos.find(x => x.id === pid);
      Object.assign(p, { nombre: nombre, notas: notas, tags: tags });
    } else {
      t.procesos.push({ id: U.uid('kp'), nombre: nombre, notas: notas, tags: tags, abierto: true, archivos: [] });
      t.abierto = true;
    }
    await App.guardarYa();
    App.cerrarModal();
    Conocimientos.render();
    App.toast('Proceso guardado', nombre, 'ok');
  },

  async borrarProceso(tid, pid) {
    const t = State.conocimientos.find(x => x.id === tid);
    const p = t && (t.procesos || []).find(x => x.id === pid);
    if (!p) return;
    const ok = await App.confirmar('Eliminar proceso', 'Se elimina «' + p.nombre + '» con sus notas y ' + (p.archivos || []).length + ' documentos.');
    if (!ok) return;
    for (const a of (p.archivos || [])) await Store.del('files', a.id);
    t.procesos = t.procesos.filter(x => x.id !== pid);
    await App.guardarYa();
    Conocimientos.render(); App.pintarAjustes();
  },

  async moverProceso(tid, i, d) {
    const t = State.conocimientos.find(x => x.id === tid);
    if (!t) return;
    const j = i + d;
    if (j < 0 || j >= t.procesos.length) return;
    const [x] = t.procesos.splice(i, 1);
    t.procesos.splice(j, 0, x);
    await App.guardarYa();
    Conocimientos.renderGestion();
  },

  /* ------------------------------- Archivos ------------------------------ */
  async subir(ev, tid, pid) {
    const t = State.conocimientos.find(x => x.id === tid);
    const p = t && (t.procesos || []).find(x => x.id === pid);
    if (!p) return;
    const files = [...ev.target.files];
    ev.target.value = '';
    if (!files.length) return;
    if (!p.archivos) p.archivos = [];

    let ok = 0, fallidos = [];
    for (const f of files) {
      const id = U.uid('pdf');
      try {
        await Store.set('files', id, f);
        p.archivos.push({ id: id, nombre: f.name, size: f.size, tipo: f.type || 'application/pdf', fecha: U.hoy() });
        ok++;
      } catch (e) { fallidos.push(f.name); }
    }
    p.abierto = true;
    await App.guardarYa();
    Conocimientos.render(); App.pintarAjustes();
    if (ok) App.toast('Documento adjuntado', ok + ' archivo(s) en «' + p.nombre + '»', 'ok');
    if (fallidos.length) App.toast('No se pudieron guardar', fallidos.join(', ') + '. El archivo puede ser muy pesado para el almacenamiento del navegador.', 'bad');
  },

  async ver(fileId) {
    const blob = await Store.get('files', fileId);
    if (!blob) return App.toast('Documento no encontrado', 'Puede haberse borrado del almacenamiento del navegador.', 'bad');
    let nombre = 'Documento';
    State.conocimientos.forEach(t => (t.procesos || []).forEach(p => (p.archivos || []).forEach(a => { if (a.id === fileId) nombre = a.nombre; })));

    if (Conocimientos.urlActual) URL.revokeObjectURL(Conocimientos.urlActual);
    Conocimientos.urlActual = URL.createObjectURL(blob);

    App.modal({
      titulo: nombre, wide: true,
      cuerpo: '<iframe class="pdf-view" src="' + Conocimientos.urlActual + '" title="' + U.esc(nombre) + '"></iframe>' +
              '<p class="hint" style="margin-top:8px">Si el documento no se ve, ábrelo en una pestaña nueva o descárgalo.</p>',
      pie: '<button class="btn btn--ghost" type="button" onclick="window.open(Conocimientos.urlActual,\'_blank\')">Abrir en pestaña nueva</button>' +
           '<button class="btn btn--ghost" type="button" onclick="Conocimientos.descargar(\'' + fileId + '\')">Descargar</button>' +
           '<button class="btn btn--primary" type="button" onclick="App.cerrarModal()">Cerrar</button>'
    });
  },

  async descargar(fileId) {
    const blob = await Store.get('files', fileId);
    if (!blob) return App.toast('Documento no encontrado', '', 'bad');
    let nombre = 'documento.pdf';
    State.conocimientos.forEach(t => (t.procesos || []).forEach(p => (p.archivos || []).forEach(a => { if (a.id === fileId) nombre = a.nombre; })));
    U.descargar(nombre, blob);
  },

  async borrarArchivo(tid, pid, fileId) {
    const t = State.conocimientos.find(x => x.id === tid);
    const p = t && (t.procesos || []).find(x => x.id === pid);
    if (!p) return;
    const a = (p.archivos || []).find(x => x.id === fileId);
    const ok = await App.confirmar('Eliminar documento', 'Se elimina «' + (a ? a.nombre : 'el archivo') + '» del panel.');
    if (!ok) return;
    await Store.del('files', fileId);
    p.archivos = (p.archivos || []).filter(x => x.id !== fileId);
    await App.guardarYa();
    Conocimientos.render(); App.pintarAjustes();
  }
};
