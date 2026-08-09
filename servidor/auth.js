/* =========================================================================
   auth.js — Control de acceso del panel
   Dos perfiles: "editor" carga y modifica; "consulta" solo mira.
   La sesión viaja en una cookie firmada, así que sigue siendo válida aunque el
   servidor se reinicie y no hace falta guardar nada en memoria.
   ========================================================================= */

'use strict';

const crypto = require('crypto');

const CLAVES = {
  editor: process.env.CLAVE_EDITOR || 'supervisor',
  consulta: process.env.CLAVE_CONSULTA || 'equipo'
};

// Con un secreto fijo las sesiones sobreviven a los reinicios del servidor
const SECRETO = process.env.SECRETO_SESION ||
  crypto.createHash('sha256').update('panel-' + CLAVES.editor + CLAVES.consulta).digest('hex');

const DURACION = 12 * 60 * 60 * 1000;        // 12 horas

const Auth = {
  /** ¿Se dejaron las claves de fábrica? Se avisa al arrancar. */
  clavesPorDefecto() {
    return !process.env.CLAVE_EDITOR || !process.env.CLAVE_CONSULTA;
  },

  firmar(texto) {
    return crypto.createHmac('sha256', SECRETO).update(texto).digest('base64url');
  },

  crearSesion(rol) {
    const cuerpo = rol + '.' + (Date.now() + DURACION);
    return cuerpo + '.' + Auth.firmar(cuerpo);
  },

  /** Devuelve el rol de la cookie, o null si no vale. */
  leerSesion(req) {
    const cookies = String(req.headers.cookie || '');
    const m = cookies.match(/(?:^|;\s*)panel_sesion=([^;]+)/);
    if (!m) return null;
    const partes = decodeURIComponent(m[1]).split('.');
    if (partes.length !== 3) return null;
    const [rol, expira, firma] = partes;
    if (Auth.firmar(rol + '.' + expira) !== firma) return null;      // manipulada
    if (Number(expira) < Date.now()) return null;                     // caducada
    if (rol !== 'editor' && rol !== 'consulta') return null;
    return rol;
  },

  /** Compara sin filtrar información por el tiempo de respuesta. */
  claveValida(clave, esperada) {
    const a = Buffer.from(String(clave));
    const b = Buffer.from(String(esperada));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  },

  rolDeClave(clave) {
    if (!clave) return null;
    if (Auth.claveValida(clave, CLAVES.editor)) return 'editor';
    if (Auth.claveValida(clave, CLAVES.consulta)) return 'consulta';
    return null;
  },

  cookieDeSesion(valor, segura) {
    const base = 'panel_sesion=' + encodeURIComponent(valor) +
      '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (DURACION / 1000);
    return segura ? base + '; Secure' : base;
  },

  cookieBorrar() { return 'panel_sesion=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'; }
};

module.exports = Auth;
