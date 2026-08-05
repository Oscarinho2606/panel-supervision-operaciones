/* =========================================================================
   informe.js — Lectura del informe de operaciones con metas
   Formato: cada indicador ocupa tres columnas seguidas —el valor que sacó el
   agente, su meta y la columna «Cumple», que se omite—. La meta puede ser
   distinta por agente, así que se guarda con cada registro.
   El skill no viene como columna: lo aporta el archivo o la hoja (Inbound,
   Chat, Correos…).
   ========================================================================= */

'use strict';

const Informe = {

  /* --------------------------- Reconocimiento ---------------------------- */

  /** Skill a partir del nombre del archivo o de la hoja. */
  skillDe(texto) {
    const n = U.norm(texto);
    if (/inbound|\binb\b|entrante/.test(n)) return 'INB';
    if (/chat/.test(n)) return 'CHAT';
    if (/correo|email|mail/.test(n)) return 'EMAIL';
    if (/outbound|\bout\b|saliente/.test(n)) return 'OUT';
    if (/\bpqr\b|peticion|queja|reclamo/.test(n)) return 'PQR';
    if (/rrss|redes|social/.test(n)) return 'RRSS';
    if (/backoffice|back office/.test(n)) return 'BACKOFFICE';
    if (/monitoreo/.test(n)) return 'MONITOREO TRANSACCIONAL';
    return '';
  },

  esMeta(h) { return /^meta|(^|[^a-z])meta([^a-z]|$)/.test(U.norm(h)); },
  esCumple(h) { return /cumple/.test(U.norm(h)); },

  /**
   * Analiza una hoja y devuelve su estructura, o null si no tiene este formato.
   * La fila de encabezados es la que trae al menos dos columnas «Cumple».
   */
  analizar(hoja) {
    const filas = hoja.filas || [];
    let hIdx = -1;
    for (let i = 0; i < Math.min(filas.length, 60); i++) {
      const cumples = (filas[i] || []).filter(c => c && Informe.esCumple(c)).length;
      if (cumples >= 2) { hIdx = i; break; }
    }
    if (hIdx < 0) return null;

    const H = (filas[hIdx] || []).map(c => String(c == null ? '' : c).trim());
    const buscar = re => H.findIndex(h => h && re.test(U.norm(h)));

    const cols = {
      cedula: buscar(/^(cedula|documento|identificacion|cc|doc|id)$/),
      nombre: buscar(/^(nombre completo|nombre agente|nombre|nombres|asesor)$/),
      anio: buscar(/^(ano|anio|year)$/),
      mes: buscar(/^(mes|month)$/),
      fecha: buscar(/^(fecha|periodo|corte)$/),
      performance: buscar(/^(performance|desempeno|nivel)$/),
      peso: buscar(/^(peso)$/)
    };
    if (cols.nombre < 0 && cols.cedula < 0) return null;

    // Tripletas: las dos columnas anteriores a cada «Cumple» son el valor y la meta
    const usadas = new Set(Object.values(cols).filter(i => i >= 0));
    const indicadores = [];
    H.forEach((h, j) => {
      if (!h || !Informe.esCumple(h)) return;
      const a = j - 2, b = j - 1;
      if (a < 0 || !H[a] || !H[b]) return;
      const aEsMeta = Informe.esMeta(H[a]), bEsMeta = Informe.esMeta(H[b]);
      if (aEsMeta === bEsMeta) return;                       // ambas o ninguna: no es una tripleta
      const colMeta = aEsMeta ? a : b;
      const colValor = aEsMeta ? b : a;
      indicadores.push({ nombre: H[colValor].replace(/\s+/g, ' ').trim(), colValor: colValor, colMeta: colMeta, colCumple: j });
      usadas.add(a); usadas.add(b); usadas.add(j);
    });
    if (!indicadores.length) return null;

    const datos = filas.slice(hIdx + 1).filter(f => {
      const ced = cols.cedula >= 0 ? String(f[cols.cedula] == null ? '' : f[cols.cedula]).trim() : '';
      const nom = cols.nombre >= 0 ? String(f[cols.nombre] == null ? '' : f[cols.nombre]).trim() : '';
      return (ced && /\d{4,}/.test(ced)) || (nom && nom.length > 3 && !Informe.esCumple(nom));
    });
    if (!datos.length) return null;

    // Columnas sueltas con datos numéricos: se ofrecen como indicadores sin meta
    H.forEach((h, j) => {
      if (!h || usadas.has(j) || Informe.esMeta(h) || Informe.esCumple(h)) return;
      const conNumero = datos.filter(f => U.num(f[j]) != null).length;
      if (conNumero >= datos.length * 0.5) {
        indicadores.push({ nombre: h.replace(/\s+/g, ' ').trim(), colValor: j, colMeta: -1, colCumple: -1 });
      }
    });

    // Perfil (unidad y dirección) de cada indicador a partir de sus valores
    indicadores.forEach(ind => {
      const muestra = datos.slice(0, 40).map(f => f[ind.colValor]);
      Object.assign(ind, Informe.perfil(ind.nombre, muestra));
      ind.id = 'i-' + U.norm(ind.nombre).replace(/ /g, '-');
      ind.incluir = true;
      const metas = ind.colMeta >= 0 ? datos.map(f => Informe.valor(f[ind.colMeta], ind)).filter(v => v != null) : [];
      ind.metaTipica = metas.length ? Informe.moda(metas) : null;
    });

    return {
      hoja: hoja.nombre, headerIdx: hIdx, cabeceras: H, cols: cols,
      indicadores: indicadores, datos: datos,
      periodo: Informe.periodo(datos, cols)
    };
  },

  /** Valor más repetido (la meta suele ser la misma para casi todos). */
  moda(vals) {
    const c = {};
    vals.forEach(v => { c[v] = (c[v] || 0) + 1; });
    return +Object.keys(c).sort((a, b) => c[b] - c[a])[0];
  },

  /** Unidad y dirección deducidas del nombre y de los propios valores. */
  perfil(nombre, muestra) {
    const n = U.norm(nombre);
    const textos = muestra.map(v => String(v == null ? '' : v));
    const conPct = textos.filter(t => t.indexOf('%') > -1).length;
    const hayPct = conPct >= Math.max(1, textos.filter(t => t.trim() !== '').length * 0.5);

    let unidad = 'num';
    if (/\baht\b|\btmo\b|tiempo|duracion|hold|acw/.test(n)) unidad = 'seg';
    else if (hayPct || /^%|\bpct\b|porcentaje|nota|calidad|adh|abs|tipificado|encuesta|conocimiento|fcr|nps/.test(n)) unidad = 'pct';

    // Menor es mejor en errores, tiempos, ausentismo y desconexiones
    const menorEsMejor = /error|mal |aht|tmo|abs\b|ausent|desconex|abandono|reproces|queja|escalad|radicados|reclamo/.test(n);
    return { unidad: unidad, direccion: menorEsMejor ? 'down' : 'up' };
  },

  /** Convierte una celda al número del indicador, respetando su unidad. */
  valor(bruto, ind) {
    if (bruto == null || String(bruto).trim() === '') return null;
    let v = U.num(bruto);
    if (v == null) return null;
    const texto = String(bruto);
    // 0,92 en una columna de porcentaje viene como fracción
    if (ind.unidad === 'pct' && texto.indexOf('%') < 0 && v > 0 && v <= 1) v = v * 100;
    return v;
  },

  /** Periodo del informe: usa Año+Mes, una columna de fecha, o el mes en curso. */
  periodo(datos, cols) {
    if (cols.anio >= 0 && cols.mes >= 0) {
      const f = datos.find(x => U.num(x[cols.anio]) && U.num(x[cols.mes]));
      if (f) {
        const a = U.num(f[cols.anio]), m = U.num(f[cols.mes]);
        return { fecha: a + '-' + String(m).padStart(2, '0') + '-01', etiqueta: Informe.nombreMes(m) + ' de ' + a };
      }
    }
    if (cols.fecha >= 0) {
      const f = datos.map(x => U.parseFecha(x[cols.fecha])).find(Boolean);
      if (f) return { fecha: f, etiqueta: U.fechaLarga(f) };
    }
    const hoy = U.hoy();
    return { fecha: hoy.slice(0, 8) + '01', etiqueta: Informe.nombreMes(+hoy.slice(5, 7)) + ' de ' + hoy.slice(0, 4) };
  },

  nombreMes(m) {
    return ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
      'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][(m || 1) - 1] || '';
  },

  /* ------------------------------ Interfaz ------------------------------- */
  ctx: null,

  abrir(libro) {
    // Analiza todas las hojas: un libro puede traer inbound, chat y correos
    const analisis = [];
    libro.hojas.forEach(h => {
      const a = Informe.analizar(h);
      if (a) {
        a.skill = Informe.skillDe(h.nombre) || Informe.skillDe(libro.nombre);
        analisis.push(a);
      }
    });
    if (!analisis.length) return false;

    Informe.ctx = { libro: libro, analisis: analisis, actual: 0 };
    Informe.pintar();
    return true;
  },

  cerrar() {
    Informe.ctx = null;
    const host = document.getElementById('rendMapper');
    host.classList.remove('is-open');
    host.innerHTML = '';
  },

  cambiarHoja(i) { Informe.ctx.actual = +i; Informe.pintar(); },

  pintar() {
    const ctx = Informe.ctx;
    const a = ctx.analisis[ctx.actual];
    const host = document.getElementById('rendMapper');
    const skills = App.skills();

    const selectorHoja = ctx.analisis.length > 1
      ? '<div class="field" style="max-width:280px"><label>Hoja</label><select onchange="Informe.cambiarHoja(this.value)">' +
        ctx.analisis.map((x, i) => '<option value="' + i + '"' + (i === ctx.actual ? ' selected' : '') + '>' +
          U.esc(x.hoja) + ' — ' + x.datos.length + ' agentes' + (x.skill ? ' · ' + U.esc(x.skill) : '') + '</option>').join('') +
        '</select></div>'
      : '';

    const opcionesSkill = ['INB', 'OUT', 'EMAIL', 'CHAT', 'PQR', 'RRSS', 'BACKOFFICE', 'MONITOREO TRANSACCIONAL']
      .concat(skills).filter((s, i, arr) => arr.indexOf(s) === i);

    host.innerHTML =
      '<div class="mapper__box">' +
        '<div class="mapper__title">Informe de operaciones detectado</div>' +
        '<p class="hint">' + U.esc(ctx.libro.nombre) + '<br>' +
          '<strong>' + a.datos.length + ' agentes</strong> · <strong>' + a.indicadores.length + ' indicadores</strong> con su meta · ' +
          'periodo <strong>' + U.esc(a.periodo.etiqueta) + '</strong>. Las columnas «Cumple» se omiten.</p>' +

        '<div class="mapper__grid">' +
          selectorHoja +
          '<div class="field"><label>Skill de este informe</label>' +
            '<select id="infSkill">' +
              opcionesSkill.map(s => '<option value="' + U.esc(s) + '"' + (a.skill === s ? ' selected' : '') + '>' + U.esc(s) + '</option>').join('') +
              '<option value="__otro">➕ Otro…</option>' +
            '</select>' +
            '<input type="text" id="infSkillOtro" placeholder="Escribe el skill" style="display:none;margin-top:6px">' +
            '<span class="hint">El archivo no trae columna de servicio; se asigna a todo el informe.</span>' +
          '</div>' +
          '<div class="field"><label>Fecha del corte</label><input type="date" id="infFecha" value="' + U.hoy() + '">' +
            '<span class="hint">Se guarda con la fecha de hoy. El archivo corresponde a ' + U.esc(a.periodo.etiqueta) +
            '; si prefieres esa, ponla aquí.</span></div>' +
        '</div>' +

        '<p class="hint" style="margin:14px 0 6px"><strong>Indicadores encontrados.</strong> ' +
          'Revisa la unidad y si el resultado es mejor cuando sube o cuando baja. La meta se toma del propio archivo, ' +
          'agente por agente. Los marcados como <em>informativos</em> no traen meta: se muestran como dato pero no puntúan.</p>' +
        '<div class="table-wrap" style="max-height:330px">' +
          '<table class="data"><thead><tr>' +
            '<th class="no-sort">Incluir</th><th class="no-sort">Indicador</th><th class="no-sort">Unidad</th>' +
            '<th class="no-sort">Mejor cuando</th><th class="num no-sort">Meta del archivo</th><th class="num no-sort">Peso</th>' +
          '</tr></thead><tbody>' +
          a.indicadores.map((ind, i) =>
            '<tr><td><input type="checkbox" data-inc="' + i + '"' + (ind.incluir ? ' checked' : '') + '></td>' +
            '<td class="name">' + U.esc(ind.nombre) + '</td>' +
            '<td><select data-uni="' + i + '" style="min-width:120px">' +
              ['num|Número', 'pct|Porcentaje', 'seg|Tiempo', 'min|Minutos', 'moneda|Moneda'].map(o => {
                const p = o.split('|');
                return '<option value="' + p[0] + '"' + (ind.unidad === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
              }).join('') + '</select></td>' +
            '<td><select data-dir="' + i + '" style="min-width:130px">' +
              '<option value="up"' + (ind.direccion === 'up' ? ' selected' : '') + '>↑ Sube</option>' +
              '<option value="down"' + (ind.direccion === 'down' ? ' selected' : '') + '>↓ Baja</option></select></td>' +
            '<td class="num">' + (ind.colMeta < 0
              ? '<span class="badge">informativo</span>'
              : U.fmt(ind.metaTipica, ind.unidad)) + '</td>' +
            '<td class="num"><input type="number" data-peso="' + i + '" value="' + (ind.colMeta < 0 ? 0 : 1) +
              '" min="0" step="0.5" style="width:70px;text-align:right"' + (ind.colMeta < 0 ? ' disabled' : '') + '></td></tr>'
          ).join('') +
          '</tbody></table>' +
        '</div>' +

        '<label class="checkline" style="margin-top:10px"><input type="checkbox" id="infReemplazar" checked> ' +
          'Reemplazar los resultados que ya existan de este periodo y skill</label>' +

        '<div class="stack">' +
          '<button class="btn btn--primary btn--sm" type="button" onclick="Informe.importar(false)">Importar esta hoja</button>' +
          (ctx.analisis.length > 1
            ? '<button class="btn btn--ghost btn--sm" type="button" onclick="Informe.importar(true)">Importar las ' + ctx.analisis.length + ' hojas</button>'
            : '') +
          '<button class="btn btn--ghost btn--sm" type="button" onclick="Informe.cerrar()">Cancelar</button>' +
        '</div>' +
      '</div>';

    host.classList.add('is-open');
    const sel = document.getElementById('infSkill');
    sel.addEventListener('change', () => {
      const caja = document.getElementById('infSkillOtro');
      caja.style.display = sel.value === '__otro' ? 'block' : 'none';
      if (sel.value === '__otro') caja.focus();
    });
    host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  /* ----------------------------- Importación ----------------------------- */
  async importar(todasLasHojas) {
    const ctx = Informe.ctx;
    const a = ctx.analisis[ctx.actual];
    const host = document.getElementById('rendMapper');

    // Ajustes hechos en la tabla
    a.indicadores.forEach((ind, i) => {
      ind.incluir = host.querySelector('[data-inc="' + i + '"]').checked;
      ind.unidad = host.querySelector('[data-uni="' + i + '"]').value;
      ind.direccion = host.querySelector('[data-dir="' + i + '"]').value;
      ind.peso = parseFloat(host.querySelector('[data-peso="' + i + '"]').value) || 1;
    });

    const selSkill = document.getElementById('infSkill').value;
    const skillManual = selSkill === '__otro' ? document.getElementById('infSkillOtro').value.trim() : selSkill;
    const fecha = document.getElementById('infFecha').value || U.hoy();
    const reemplazar = document.getElementById('infReemplazar').checked;

    const hojas = todasLasHojas ? ctx.analisis : [a];
    let totalAgentes = 0, totalInd = 0, totalRenombrados = 0;
    const skillsCargados = [];

    for (const an of hojas) {
      // Cada hoja conserva la configuración de la hoja revisada cuando comparten indicador
      if (an !== a) {
        an.indicadores.forEach(ind => {
          const ref = a.indicadores.find(x => x.id === ind.id);
          if (ref) { ind.incluir = ref.incluir; ind.unidad = ref.unidad; ind.direccion = ref.direccion; ind.peso = ref.peso; }
          else { ind.incluir = true; ind.peso = 1; }
        });
      }
      // Todas las hojas del mismo libro comparten el corte
      const skill = todasLasHojas ? (an.skill || skillManual) : skillManual;
      const res = Informe.importarHoja(an, skill, fecha, reemplazar);
      totalAgentes += res.agentes;
      totalInd = Math.max(totalInd, res.indicadores);
      totalRenombrados += res.renombrados;
      if (skill) skillsCargados.push(skill);
    }

    // Los indicadores sin ningún dato se ocultan: si no, quedan columnas vacías
    // de configuraciones anteriores. Siguen ahí y se pueden reactivar.
    let ocultos = 0;
    State.indicadores.forEach(m => {
      if (m.activo !== false && !State.registros.some(r => r.valores && r.valores[m.id] != null)) {
        m.activo = false; ocultos++;
      }
    });

    // El tablero de "Por agente" arranca con los agentes recién cargados
    const conDatos = [...new Set(State.registros.map(r => r.agente))];
    State.ui.agentesSel = conDatos.slice(0, 12);

    await App.guardarYa();
    Informe.cerrar();

    const r = App.rangoDatos(State.registros);
    State.ui.filtros = { desde: r.min, hasta: r.max, skill: '', buscar: '' };
    Rend.init(); Agentes.init(); Turnos.init();
    App.tab('rendimiento', 'r-ranking');
    App.go('rendimiento');
    App.toast('Informe cargado',
      totalAgentes + ' agentes · ' + totalInd + ' indicadores con su meta' +
      (skillsCargados.length ? ' · ' + [...new Set(skillsCargados)].join(', ') : '') +
      (ocultos ? ' · se ocultaron ' + ocultos + ' indicadores sin datos' : '') +
      (totalRenombrados ? ' · se unificaron ' + totalRenombrados + ' registros de la malla' : ''), 'ok');
  },

  /** Vuelca una hoja al estado: crea los indicadores y un registro por agente. */
  importarHoja(an, skill, fecha, reemplazar) {
    const activos = an.indicadores.filter(i => i.incluir);

    // Los indicadores del archivo se registran en la configuración del panel
    activos.forEach(ind => {
      let m = State.indicadores.find(x => x.id === ind.id);
      if (!m) {
        m = { id: ind.id, nombre: ind.nombre, activo: true };
        State.indicadores.push(m);
      }
      m.nombre = ind.nombre;
      m.unidad = ind.unidad;
      m.direccion = ind.direccion;
      m.activo = true;
      m.origen = 'informe';
      if (ind.colMeta >= 0 && ind.metaTipica != null) {
        m.meta = ind.metaTipica;
        m.peso = ind.peso == null ? 1 : ind.peso;
        m.informativo = false;
      } else {
        // Columna sin meta en el archivo: se muestra como dato, no puntúa
        m.meta = null;
        m.peso = 0;
        m.informativo = true;
      }
    });

    if (reemplazar) {
      State.registros = State.registros.filter(r => !(r.fecha === fecha && (r.skill || '') === (skill || '')));
    }

    let agentes = 0, renombrados = 0;
    an.datos.forEach(f => {
      const doc = an.cols.cedula >= 0 ? String(f[an.cols.cedula] == null ? '' : f[an.cols.cedula]).trim() : '';
      const nombre = an.cols.nombre >= 0 ? String(f[an.cols.nombre] == null ? '' : f[an.cols.nombre]).trim() : '';
      const agente = nombre || (doc ? 'Documento ' + doc : '');
      if (!agente) return;

      // El nombre del informe manda: unifica al mismo documento en la malla y en
      // registros anteriores, para no terminar con la misma persona dos veces
      if (doc && nombre) {
        State.turnos.forEach(t => { if (t.doc === doc && t.agente !== agente) { t.agente = agente; renombrados++; } });
        State.registros.forEach(r => { if (r.doc === doc && r.agente !== agente) r.agente = agente; });
        if (State.ui.agentesSel) {
          State.ui.agentesSel = State.ui.agentesSel.map(n => n);
        }
      }

      const valores = {}, metas = {};
      activos.forEach(ind => {
        const v = Informe.valor(f[ind.colValor], ind);
        if (v != null) valores[ind.id] = v;
        if (ind.colMeta >= 0) {
          const m = Informe.valor(f[ind.colMeta], ind);
          if (m != null) metas[ind.id] = m;
        }
      });
      if (!Object.keys(valores).length) return;

      const previo = State.registros.find(r => r.fecha === fecha && U.norm(r.agente) === U.norm(agente) && (r.skill || '') === (skill || ''));
      const reg = previo || { id: U.uid('reg'), fecha: fecha, agente: agente };
      reg.doc = doc || reg.doc || '';
      reg.skill = skill || reg.skill || '';
      reg.valores = Object.assign({}, reg.valores, valores);
      reg.metas = Object.assign({}, reg.metas, metas);
      if (an.cols.performance >= 0) reg.performance = String(f[an.cols.performance] == null ? '' : f[an.cols.performance]).trim();
      if (!previo) State.registros.push(reg);
      agentes++;
    });

    return { agentes: agentes, indicadores: activos.length, renombrados: renombrados };
  }
};
