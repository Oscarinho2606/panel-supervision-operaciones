/* =========================================================================
   demo.js — Datos de ejemplo
   Sirven para conocer el panel antes de cargar la información real.
   ========================================================================= */

'use strict';

const Demo = {

  /* Los skills son los segmentos de la malla de programación */
  AGENTES: [
    { n: 'María Gómez',      d: '1020304050', s: 'INB',   nivel: 1.08 },
    { n: 'Carlos Ruiz',      d: '1020304051', s: 'INB',   nivel: 0.94 },
    { n: 'Ana Torres',       d: '1020304052', s: 'INB',   nivel: 1.02 },
    { n: 'Luis Peña',        d: '1020304053', s: 'INB',   nivel: 0.86 },
    { n: 'Diana Ramírez',    d: '1020304054', s: 'OUT',   nivel: 1.11 },
    { n: 'Jorge Castillo',   d: '1020304055', s: 'OUT',   nivel: 0.99 },
    { n: 'Paola Herrera',    d: '1020304056', s: 'OUT',   nivel: 1.05 },
    { n: 'Andrés Molina',    d: '1020304057', s: 'EMAIL', nivel: 0.91 },
    { n: 'Laura Quintero',   d: '1020304058', s: 'EMAIL', nivel: 1.00 },
    { n: 'Felipe Vargas',    d: '1020304059', s: 'CHAT',  nivel: 0.83 },
    { n: 'Natalia Cárdenas', d: '1020304060', s: 'PQR',   nivel: 1.07 },
    { n: 'Sebastián Rojas',  d: '1020304061', s: 'RRSS',  nivel: 0.96 }
  ],

  rnd(semilla) {                       // aleatorio reproducible
    let x = Math.sin(semilla) * 10000;
    return x - Math.floor(x);
  },

  async cargar(sinPreguntar) {
    if (!sinPreguntar) {
      const ok = await App.confirmar('Cargar datos de ejemplo',
        'Se agregan agentes, 30 días de indicadores, una malla de turnos de dos semanas y una base de conocimiento de muestra. ' +
        'Tu información actual se reemplaza.');
      if (!ok) return;
    }

    State.indicadores = JSON.parse(JSON.stringify(INDICADORES_BASE));
    State.registros = Demo.registros();
    State.turnos = Demo.turnos();
    State.requerido = Demo.requerido();
    State.conocimientos = Demo.conocimiento();
    State.ui.agentesSel = Demo.AGENTES.slice(0, 6).map(a => a.n);
    const r = App.rangoDatos(State.registros);
    State.ui.filtros = { desde: U.addDays(r.max, -13), hasta: r.max, skill: '', buscar: '' };

    await App.guardarYa();
    document.getElementById('fDesde').value = State.ui.filtros.desde;
    document.getElementById('fHasta').value = State.ui.filtros.hasta;
    document.getElementById('aDesde').value = State.ui.filtros.desde;
    document.getElementById('aHasta').value = State.ui.filtros.hasta;
    document.getElementById('tFecha').value = U.hoy();
    Rend.init(); Agentes.init(); Turnos.init(); Conocimientos.init();
    App.go(App.vistaDelEnlace() || 'rendimiento'); App.pintarAjustes();
    App.toast('Datos de ejemplo cargados', 'Explora las pestañas para ver cómo funciona el panel.', 'ok');
  },

  /** Con #demo en la dirección se carga el ejemplo solo si el panel está vacío,
      para poder enseñar cómo funciona sin tocar información real. */
  autoSiVacio() {
    const partes = String(location.hash || '').replace('#', '').split(/[,&]/).map(s => s.trim());
    if (partes.indexOf('demo') < 0) return false;
    if (State.registros.length || State.turnos.length || State.conocimientos.length) return false;
    Demo.cargar(true);
    return true;
  },

  registros() {
    const out = [];
    const hoy = U.hoy();
    for (let d = 29; d >= 0; d--) {
      const fecha = U.addDays(hoy, -d);
      const dow = new Date(fecha + 'T12:00:00').getDay();
      if (dow === 0) continue;                                   // sin operación los domingos
      const factorDia = dow === 6 ? 0.82 : 1;                    // sábados más flojos
      Demo.AGENTES.forEach((a, i) => {
        const s = Demo.rnd(d * 100 + i);
        if (s < 0.06) return;                                    // ausencia ocasional
        const ruido = () => (Demo.rnd(d * 997 + i * 31 + out.length) - 0.5) * 2;
        const nivel = a.nivel + (Demo.rnd(i * 7 + d) - 0.5) * 0.10 + (d < 8 ? 0.03 : 0);   // leve mejora reciente
        out.push({
          id: U.uid('reg'), fecha: fecha, agente: a.n, doc: a.d, skill: a.s,
          valores: {
            llamadas: Math.round(60 * nivel * factorDia + ruido() * 6),
            tmo: Math.round(330 / nivel + ruido() * 25),
            calidad: Math.min(100, Math.round((92 * nivel + ruido() * 3) * 10) / 10),
            adherencia: Math.min(100, Math.round((95 * (0.5 + nivel / 2) + ruido() * 2) * 10) / 10),
            csat: Math.min(100, Math.round((90 * nivel + ruido() * 4) * 10) / 10),
            conversion: Math.max(0, Math.round((25 * nivel + ruido() * 5) * 10) / 10)
          },
          nota: ''
        });
      });
    }
    return out;
  },

  turnos() {
    const out = [];
    const hoy = U.hoy();
    const plantillas = [[420, 900], [480, 960], [600, 1080], [840, 1320], [360, 840]];   // 07-15, 08-16, 10-18, 14-22, 06-14
    for (let d = -7; d <= 6; d++) {
      const fecha = U.addDays(hoy, d);
      const dow = new Date(fecha + 'T12:00:00').getDay();
      Demo.AGENTES.forEach((a, i) => {
        const descansa = (i + Math.abs(d)) % 7 === 0 || dow === 0;
        if (descansa) {
          out.push({ id: U.uid('trn'), fecha: fecha, agente: a.n, doc: a.d, skill: a.s, estado: 'descanso', ini: null, fin: null, pausas: [] });
          return;
        }
        const p = plantillas[(i + Math.abs(d)) % plantillas.length];
        const ini = p[0], fin = p[1];
        out.push({
          id: U.uid('trn'), fecha: fecha, agente: a.n, doc: a.d, skill: a.s, estado: 'turno',
          ini: ini, fin: fin,
          pausas: [
            { tipo: 'Break 1', ini: ini + 150, fin: ini + 165 },
            { tipo: 'Almuerzo', ini: ini + 270, fin: ini + 330 },
            { tipo: 'Break 2', ini: ini + 420, fin: ini + 435 }
          ]
        });
      });
    }
    return out;
  },

  requerido() {
    const req = {};
    const skills = ['INB', 'OUT', 'EMAIL', 'CHAT', 'PQR', 'RRSS'];
    const curva = { 6: .4, 7: .7, 8: 1, 9: 1, 10: 1.1, 11: 1.1, 12: .9, 13: .9, 14: 1, 15: 1, 16: 1, 17: .9, 18: .7, 19: .6, 20: .5, 21: .4 };
    const base = { 'INB': 3, 'OUT': 2, 'EMAIL': 2, 'CHAT': 1, 'PQR': 1, 'RRSS': 1 };
    skills.forEach(s => {
      for (let h = 0; h < 24; h++) {
        const f = curva[h];
        if (!f) continue;
        req[s + '||' + U.hhmm(h * 60)] = Math.max(1, Math.round(base[s] * f));
      }
    });
    return req;
  },

  conocimiento() {
    return [
      {
        id: U.uid('kt'), titulo: 'Gestión de llamadas entrantes', abierto: true, skill: 'INB',
        descripcion: 'Procesos de la línea de atención telefónica',
        procesos: [
          {
            id: U.uid('kp'), nombre: 'Generar una nota crédito', tags: ['facturación', 'ajustes'], abierto: true, archivos: [],
            notas: '1. Verificar en el sistema que la factura exista y no esté anulada.\n' +
                   '2. Validar el motivo con el cliente y dejarlo registrado en la gestión.\n' +
                   '3. Ingresar a Facturación → Notas crédito → Nueva.\n' +
                   '4. Seleccionar la factura origen y el concepto del ajuste.\n' +
                   '5. Adjuntar el soporte de la solicitud (correo o grabación).\n' +
                   '6. Enviar a aprobación del coordinador si el valor supera $500.000.\n\n' +
                   'Tiempo de respuesta: 24 horas hábiles.\n' +
                   'Escalamiento: si la factura tiene más de 60 días, va al área de cartera.'
          },
          {
            id: U.uid('kp'), nombre: 'Reclamación por doble cobro', tags: ['facturación', 'reclamos'], archivos: [],
            notas: '1. Confirmar los dos movimientos en el estado de cuenta.\n' +
                   '2. Tomar captura del extracto y adjuntarla al caso.\n' +
                   '3. Radicar en la mesa de servicio con la tipificación «Doble cobro».\n' +
                   '4. Informar al cliente el número de radicado y el tiempo estimado (5 días hábiles).\n' +
                   '5. Hacer seguimiento diario hasta el cierre.'
          }
        ]
      },
      {
        id: U.uid('kt'), titulo: 'Campañas de salida', skill: 'OUT',
        descripcion: 'Guiones y procedimientos de las campañas salientes',
        procesos: [
          {
            id: U.uid('kp'), nombre: 'Solicitud de cancelación voluntaria', tags: ['retención', 'guion'], archivos: [],
            notas: 'Escucha activa primero: identifica el motivo real antes de ofrecer.\n\n' +
                   'Motivos frecuentes y oferta sugerida:\n' +
                   '· Precio → plan equivalente con descuento del 20% por 6 meses.\n' +
                   '· Fallas del servicio → visita técnica prioritaria + compensación del mes.\n' +
                   '· Mudanza → validar cobertura en la nueva dirección antes de ofrecer traslado.\n\n' +
                   'Nunca prometas beneficios que no estén en la matriz vigente.\n' +
                   'Si el cliente insiste después de dos ofertas, procede con la cancelación y tipifica el motivo.'
          },
          {
            id: U.uid('kp'), nombre: 'Cliente en mora que solicita reactivación', tags: ['retención', 'cartera'], archivos: [],
            notas: '1. Consultar el saldo pendiente y la fecha del último pago.\n' +
                   '2. Ofrecer acuerdo de pago si la mora es menor a 90 días.\n' +
                   '3. Para mora mayor, transferir a cartera especializada.\n' +
                   '4. La reactivación se hace efectiva máximo 2 horas después del pago confirmado.'
          }
        ]
      },
      {
        id: U.uid('kt'), titulo: 'Radicación y respuesta de PQR', skill: 'PQR',
        descripcion: 'Peticiones, quejas y reclamos: tiempos y escalamiento',
        procesos: [
          {
            id: U.uid('kp'), nombre: 'Radicar una queja formal', tags: ['pqr', 'radicación'], archivos: [],
            notas: '1. Confirmar los datos del titular antes de radicar.\n' +
                   '2. Clasificar el caso: petición, queja, reclamo o sugerencia.\n' +
                   '3. Registrar el detalle textual de lo que dice el cliente, sin interpretar.\n' +
                   '4. Entregar el número de radicado y el tiempo legal de respuesta (15 días hábiles).\n' +
                   '5. Adjuntar los soportes que el cliente envíe por correo.'
          },
          {
            id: U.uid('kp'), nombre: 'Caso próximo a vencer', tags: ['pqr', 'alertas'], archivos: [],
            notas: 'A partir del día 10 hábil el caso entra en alerta.\n\n' +
                   '· Revisar el estado con el área responsable.\n' +
                   '· Si no hay respuesta, escalar al coordinador el mismo día.\n' +
                   '· Nunca dejar vencer un caso sin dejar traza de la gestión.'
          }
        ]
      },
      {
        id: U.uid('kt'), titulo: 'Atención por correo y chat', skill: 'EMAIL',
        descripcion: 'Estándares de respuesta escrita',
        procesos: [
          {
            id: U.uid('kp'), nombre: 'Estructura de una respuesta escrita', tags: ['email', 'calidad'], archivos: [],
            notas: '1. Saludo con el nombre del cliente.\n' +
                   '2. Confirmar que entendiste la solicitud, en una frase.\n' +
                   '3. Dar la respuesta concreta primero; el detalle después.\n' +
                   '4. Indicar el siguiente paso y quién lo hace.\n' +
                   '5. Cerrar ofreciendo el canal de contacto.\n\n' +
                   'Tiempo de respuesta comprometido: 4 horas hábiles.'
          }
        ]
      },
      {
        // Sin skill: es material general, visible desde cualquier skill
        id: U.uid('kt'), titulo: 'Operación diaria del equipo', skill: '',
        descripcion: 'Rutinas del supervisor y manejo de novedades',
        procesos: [
          {
            id: U.uid('kp'), nombre: 'Apertura de turno', tags: ['supervisión'], archivos: [],
            notas: '· 15 minutos antes: revisar la malla del día y confirmar asistencia.\n' +
                   '· Verificar que todos estén logueados en su skill correspondiente.\n' +
                   '· Reportar novedades de personal al WFM antes de las 8:00.\n' +
                   '· Publicar los resultados del día anterior en el tablero del equipo.'
          },
          {
            id: U.uid('kp'), nombre: 'Manejo de una ausencia no reportada', tags: ['supervisión', 'novedades'], archivos: [],
            notas: '1. Intentar contacto telefónico en los primeros 15 minutos.\n' +
                   '2. Registrar la novedad en la malla como «Ausencia».\n' +
                   '3. Evaluar el impacto en la cobertura del skill y solicitar apoyo si el déficit supera 2 asesores.\n' +
                   '4. Reportar a Gestión Humana el mismo día.'
          },
          {
            id: U.uid('kp'), nombre: 'Retroalimentación de indicadores', tags: ['supervisión', 'calidad'], archivos: [],
            notas: 'Frecuencia: semanal por agente, con evidencia del panel.\n\n' +
                   'Estructura sugerida:\n' +
                   '1. Reconocer lo que viene bien (dato concreto).\n' +
                   '2. Mostrar el indicador por debajo de la meta y su tendencia.\n' +
                   '3. Acordar una acción medible para la semana siguiente.\n' +
                   '4. Dejar registro firmado en el formato de acompañamiento.'
          }
        ]
      }
    ];
  },

  async cargarConocimiento() {
    State.conocimientos = State.conocimientos.concat(Demo.conocimiento());
    await App.guardarYa();
    Conocimientos.init(); Conocimientos.render();
    App.toast('Ejemplo cargado', 'Puedes editarlo o eliminarlo cuando quieras.', 'ok');
  }
};
