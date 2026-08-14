/* =========================================================================
   nube.js — Conexión directa con Supabase, sin librerías
   Habla con la API REST del proyecto: entrar, leer y guardar el contenido del
   panel, y avisar cuando alguien carga algo nuevo.
   ========================================================================= */

'use strict';

const Nube = {
  url: '', clave: '',
  sesion: null,          // { access_token, refresh_token, expira, correo }
  rol: 'consulta',
  version: 0,
  ultimoPor: '',

  /** ¿Hay un proyecto de Supabase configurado? */
  configurada() {
    return !!(typeof SUPABASE !== 'undefined' && SUPABASE.URL && SUPABASE.CLAVE);
  },

  iniciar() {
    if (!Nube.configurada()) return false;
    Nube.url = String(SUPABASE.URL).replace(/\/+$/, '');
    Nube.clave = SUPABASE.CLAVE;
    try {
      const guardada = localStorage.getItem('panel_sesion_nube');
      if (guardada) Nube.sesion = JSON.parse(guardada);
    } catch (e) { /* el navegador puede bloquear el almacenamiento */ }
    return true;
  },

  guardarSesion(s) {
    Nube.sesion = s;
    try {
      if (s) localStorage.setItem('panel_sesion_nube', JSON.stringify(s));
      else localStorage.removeItem('panel_sesion_nube');
    } catch (e) { /* sin persistencia, la sesión dura lo que la pestaña */ }
  },

  cabeceras(conAuth) {
    const h = { 'apikey': Nube.clave, 'Content-Type': 'application/json' };
    if (conAuth !== false && Nube.sesion) h['Authorization'] = 'Bearer ' + Nube.sesion.access_token;
    return h;
  },

  /* -------------------------------- Acceso ------------------------------- */
  async entrar(correo, clave) {
    const r = await fetch(Nube.url + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: Nube.cabeceras(false),
      body: JSON.stringify({ email: correo, password: clave })
    });
    const res = await r.json();
    if (!r.ok) {
      const msg = String(res.error_description || res.msg || res.message || '');
      throw new Error(/invalid|credentials/i.test(msg)
        ? 'El correo o la contraseña no son correctos'
        : /confirm/i.test(msg) ? 'Falta confirmar el correo desde Supabase' : (msg || 'No se pudo entrar'));
    }
    Nube.guardarSesion({
      access_token: res.access_token, refresh_token: res.refresh_token,
      expira: Date.now() + (res.expires_in || 3600) * 1000,
      correo: (res.user && res.user.email) || correo
    });
    return true;
  },

  /** Renueva el acceso antes de que caduque; devuelve false si ya no vale. */
  async renovar() {
    if (!Nube.sesion) return false;
    if (Date.now() < Nube.sesion.expira - 60000) return true;
    try {
      const r = await fetch(Nube.url + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', headers: Nube.cabeceras(false),
        body: JSON.stringify({ refresh_token: Nube.sesion.refresh_token })
      });
      if (!r.ok) { Nube.guardarSesion(null); return false; }
      const res = await r.json();
      Nube.guardarSesion({
        access_token: res.access_token, refresh_token: res.refresh_token,
        expira: Date.now() + (res.expires_in || 3600) * 1000,
        correo: Nube.sesion.correo
      });
      return true;
    } catch (e) { return false; }
  },

  salir() {
    Nube.guardarSesion(null);
    Nube.rol = 'consulta';
  },

  /** Comprueba que la sesión sirve y averigua el perfil. */
  async comprobarSesion() {
    if (!Nube.sesion) return false;
    if (!(await Nube.renovar())) return false;
    try {
      const info = await Nube.llamar('panel_version', {});
      if (!info) return false;
      Nube.rol = info.rol || 'consulta';
      Nube.version = Number(info.version || 0);
      Nube.ultimoPor = info.por || '';
      return true;
    } catch (e) { return false; }
  },

  /* ------------------------------ Operaciones ---------------------------- */
  /** Llama a una función de la base (RPC). */
  async llamar(funcion, argumentos) {
    await Nube.renovar();
    const r = await fetch(Nube.url + '/rest/v1/rpc/' + funcion, {
      method: 'POST', headers: Nube.cabeceras(), body: JSON.stringify(argumentos || {})
    });
    if (r.status === 401) { Nube.guardarSesion(null); throw new Error('Tu sesión caducó. Vuelve a entrar.'); }
    if (!r.ok) throw new Error('No se pudo consultar la base de datos');
    return await r.json();
  },

  async leerEstado() {
    await Nube.renovar();
    const r = await fetch(Nube.url + '/rest/v1/panel_estado?id=eq.1&select=datos,version,actualizado_por', {
      headers: Nube.cabeceras(), cache: 'no-store'
    });
    if (!r.ok) return undefined;
    const filas = await r.json();
    if (!filas.length) return undefined;
    Nube.version = Number(filas[0].version);
    Nube.ultimoPor = filas[0].actualizado_por || '';
    const datos = filas[0].datos;
    return datos && Object.keys(datos).length ? datos : undefined;
  },

  async guardarEstado(datos) {
    const res = await Nube.llamar('panel_guardar', { p_version: Nube.version, p_datos: datos });
    if (!res || res.ok !== true) {
      if (res && res.error === 'solo_consulta') throw new Error('Tu acceso es de solo consulta: no puedes modificar la información.');
      if (res && res.error === 'desactualizado') {
        Nube.version = Number(res.version);
        throw new Error('Alguien más guardó cambios. Recarga la página para verlos antes de seguir.');
      }
      throw new Error('No se pudo guardar en la base de datos');
    }
    Nube.version = Number(res.version);
    return true;
  },

  /* -------------------------------- Archivos ----------------------------- */
  /* Los PDF van a Supabase Storage, en el depósito "documentos". */
  async subirArchivo(id, blob, nombre) {
    await Nube.renovar();
    const r = await fetch(Nube.url + '/storage/v1/object/documentos/' + encodeURIComponent(id), {
      method: 'POST',
      headers: {
        'apikey': Nube.clave,
        'Authorization': 'Bearer ' + (Nube.sesion ? Nube.sesion.access_token : ''),
        'Content-Type': blob.type || 'application/pdf',
        'x-upsert': 'true'
      },
      body: blob
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(/Bucket not found/i.test(t)
        ? 'Falta crear el depósito "documentos" en Supabase → Storage'
        : 'No se pudo subir el documento');
    }
    return true;
  },

  async bajarArchivo(id) {
    await Nube.renovar();
    const r = await fetch(Nube.url + '/storage/v1/object/documentos/' + encodeURIComponent(id), {
      headers: { 'apikey': Nube.clave, 'Authorization': 'Bearer ' + (Nube.sesion ? Nube.sesion.access_token : '') }
    });
    return r.ok ? await r.blob() : undefined;
  },

  async borrarArchivo(id) {
    await Nube.renovar();
    await fetch(Nube.url + '/storage/v1/object/documentos/' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { 'apikey': Nube.clave, 'Authorization': 'Bearer ' + (Nube.sesion ? Nube.sesion.access_token : '') }
    });
    return true;
  },

  /* ---------------------------- Cambios en vivo -------------------------- */
  /**
   * Escucha los cambios de la tabla por WebSocket, igual que hace la librería
   * oficial. Si no se puede abrir, se consulta cada pocos segundos.
   */
  escuchar(alCambiar) {
    let ws = null, latido = null, reintentos = 0;

    const porConsulta = () => setInterval(async () => {
      if (document.hidden) return;
      try {
        const info = await Nube.llamar('panel_version', {});
        if (info && Number(info.version) !== Nube.version) alCambiar(info);
      } catch (e) { /* se reintenta en el siguiente ciclo */ }
    }, 8000);

    const conectar = () => {
      try {
        const wsUrl = Nube.url.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' +
          encodeURIComponent(Nube.clave) + '&vsn=1.0.0';
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          reintentos = 0;
          ws.send(JSON.stringify({
            topic: 'realtime:panel', event: 'phx_join', ref: '1',
            payload: {
              config: {
                broadcast: { self: false }, presence: { key: '' },
                postgres_changes: [{ event: '*', schema: 'public', table: 'panel_estado' }]
              },
              access_token: Nube.sesion ? Nube.sesion.access_token : null
            }
          }));
          latido = setInterval(() => {
            if (ws.readyState === 1) ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(Date.now()) }));
          }, 25000);
        };

        ws.onmessage = ev => {
          try {
            const m = JSON.parse(ev.data);
            if (m.event !== 'postgres_changes') return;
            const nuevo = m.payload && m.payload.data && m.payload.data.record;
            if (nuevo && Number(nuevo.version) !== Nube.version) {
              alCambiar({ version: Number(nuevo.version), por: nuevo.actualizado_por });
            }
          } catch (e) { /* mensaje de servicio */ }
        };

        ws.onclose = () => {
          clearInterval(latido);
          // Si el canal no se sostiene, se sigue con consultas periódicas
          if (++reintentos <= 3) setTimeout(conectar, 3000 * reintentos);
          else porConsulta();
        };
        ws.onerror = () => { try { ws.close(); } catch (e) {} };
      } catch (e) {
        porConsulta();
      }
    };

    if (typeof WebSocket === 'undefined') porConsulta(); else conectar();
  }
};
