/* =========================================================================
   server.js — Servidor del Panel de Supervisión de Operaciones
   Sirve el panel y guarda todo en PostgreSQL, para que cualquiera que abra la
   dirección desde la red vea exactamente la misma información.
   Arranque:  node servidor/server.js
   ========================================================================= */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Pool } = require('pg');
const Auth = require('./auth');

/* En la nube (Supabase, Neon, Render) la conexión llega en DATABASE_URL y
   necesita SSL; en el equipo local se usa el PostgreSQL de siempre. */
const URL_BD = process.env.DATABASE_URL || '';
const BD_LOCAL = /@(localhost|127\.0\.0\.1)[:/]/.test(URL_BD);
const CONFIG = {
  puerto: Number(process.env.PORT || process.env.PUERTO || 3000),
  bd: URL_BD
    ? { connectionString: URL_BD, ssl: BD_LOCAL ? false : { rejectUnauthorized: false }, max: 5 }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'panel_operaciones',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || undefined
      },
  enLaNube: !!URL_BD,
  raizWeb: path.join(__dirname, '..'),
  maxCuerpo: 200 * 1024 * 1024        // 200 MB: los PDF pueden pesar
};

const pool = new Pool(CONFIG.bd);

/* ------------------------------ Utilidades ------------------------------- */
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.woff2': 'font/woff2'
};

function json(res, codigo, cuerpo) {
  const txt = JSON.stringify(cuerpo);
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(txt),
    'Cache-Control': 'no-store'
  });
  res.end(txt);
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    const trozos = [];
    let total = 0;
    req.on('data', t => {
      total += t.length;
      if (total > CONFIG.maxCuerpo) { reject(new Error('El archivo supera el tamaño permitido')); req.destroy(); return; }
      trozos.push(t);
    });
    req.on('end', () => resolve(Buffer.concat(trozos)));
    req.on('error', reject);
  });
}

function quienEs(req) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
  return ip === '::1' || ip === '127.0.0.1' ? 'este equipo' : ip;
}

/* -------------------------------- Rutas ---------------------------------- */
async function api(req, res, ruta) {
  const seguro = CONFIG.enLaNube || (req.headers['x-forwarded-proto'] === 'https');

  /* --- Entrar y salir --- */
  if (ruta === '/api/login' && req.method === 'POST') {
    const cuerpo = JSON.parse((await leerCuerpo(req)).toString('utf8') || '{}');
    const rol = Auth.rolDeClave(cuerpo.clave);
    if (!rol) {
      await new Promise(r => setTimeout(r, 600));         // frena los intentos a ciegas
      return json(res, 401, { error: 'La contraseña no es correcta' });
    }
    res.setHeader('Set-Cookie', Auth.cookieDeSesion(Auth.crearSesion(rol), seguro));
    return json(res, 200, { ok: true, rol: rol });
  }

  if (ruta === '/api/salir' && req.method === 'POST') {
    res.setHeader('Set-Cookie', Auth.cookieBorrar());
    return json(res, 200, { ok: true });
  }

  if (ruta === '/api/sesion' && req.method === 'GET') {
    const rol = Auth.leerSesion(req);
    return json(res, 200, { autenticado: !!rol, rol: rol });
  }

  /* --- De aquí en adelante hace falta haber entrado --- */
  const rol = Auth.leerSesion(req);
  if (!rol) return json(res, 401, { error: 'Necesitas entrar al panel' });

  // Consultar es libre; cargar, modificar y borrar solo el supervisor
  if (req.method !== 'GET' && rol !== 'editor') {
    return json(res, 403, { error: 'Tu acceso es de solo consulta: no puedes modificar la información.' });
  }

  /* --- Estado completo del panel --- */
  if (ruta === '/api/estado' && req.method === 'GET') {
    const r = await pool.query('SELECT datos, version, actualizado, actualizado_por FROM estado WHERE id = 1');
    const f = r.rows[0] || { datos: {}, version: 0 };
    return json(res, 200, {
      version: Number(f.version), datos: f.datos,
      actualizado: f.actualizado, actualizadoPor: f.actualizado_por
    });
  }

  if (ruta === '/api/estado' && req.method === 'PUT') {
    const cuerpo = JSON.parse((await leerCuerpo(req)).toString('utf8'));
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const actual = await cliente.query('SELECT version FROM estado WHERE id = 1 FOR UPDATE');
      const vActual = Number(actual.rows[0].version);

      // Si alguien guardó mientras tanto, se avisa en vez de pisar su trabajo
      if (cuerpo.version != null && Number(cuerpo.version) !== vActual) {
        await cliente.query('ROLLBACK');
        const r = await pool.query('SELECT datos, version, actualizado_por FROM estado WHERE id = 1');
        return json(res, 409, {
          error: 'desactualizado', version: Number(r.rows[0].version),
          datos: r.rows[0].datos, actualizadoPor: r.rows[0].actualizado_por
        });
      }

      const nueva = vActual + 1;
      const por = quienEs(req);
      await cliente.query(
        'UPDATE estado SET datos = $1, version = $2, actualizado = now(), actualizado_por = $3 WHERE id = 1',
        [cuerpo.datos, nueva, por]);
      await cliente.query('INSERT INTO historial (version, datos, guardado_por) VALUES ($1, $2, $3)',
        [nueva, cuerpo.datos, por]);
      // Se conservan las últimas 50 copias
      await cliente.query(
        'DELETE FROM historial WHERE id NOT IN (SELECT id FROM historial ORDER BY id DESC LIMIT 50)');
      await cliente.query('COMMIT');
      return json(res, 200, { ok: true, version: nueva });
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally {
      cliente.release();
    }
  }

  /* --- Solo la versión: para que los demás detecten cambios sin descargar todo --- */
  if (ruta === '/api/version' && req.method === 'GET') {
    const r = await pool.query('SELECT version, actualizado, actualizado_por FROM estado WHERE id = 1');
    return json(res, 200, {
      version: Number(r.rows[0].version),
      actualizado: r.rows[0].actualizado, actualizadoPor: r.rows[0].actualizado_por
    });
  }

  /* --- Archivos PDF --- */
  const mArch = ruta.match(/^\/api\/archivo\/([\w-]+)$/);
  if (mArch) {
    const id = mArch[1];
    if (req.method === 'GET') {
      const r = await pool.query('SELECT nombre, tipo, contenido FROM archivos WHERE id = $1', [id]);
      if (!r.rows.length) return json(res, 404, { error: 'no encontrado' });
      const f = r.rows[0];
      res.writeHead(200, {
        'Content-Type': f.tipo || 'application/pdf',
        'Content-Length': f.contenido.length,
        'Content-Disposition': 'inline; filename="' + encodeURIComponent(f.nombre || 'documento.pdf') + '"'
      });
      return res.end(f.contenido);
    }
    if (req.method === 'PUT') {
      const datos = await leerCuerpo(req);
      await pool.query(
        `INSERT INTO archivos (id, nombre, tipo, tamano, contenido) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET nombre=$2, tipo=$3, tamano=$4, contenido=$5`,
        [id, decodeURIComponent(req.headers['x-nombre'] || ''), req.headers['content-type'] || 'application/pdf',
         datos.length, datos]);
      return json(res, 200, { ok: true, tamano: datos.length });
    }
    if (req.method === 'DELETE') {
      await pool.query('DELETE FROM archivos WHERE id = $1', [id]);
      return json(res, 200, { ok: true });
    }
  }

  /* --- Información del servidor, para la pestaña de Ajustes --- */
  if (ruta === '/api/info' && req.method === 'GET') {
    const r0 = { rol: rol };
    const r = await pool.query(`
      SELECT (SELECT version FROM estado WHERE id=1) AS version,
             (SELECT actualizado FROM estado WHERE id=1) AS actualizado,
             (SELECT actualizado_por FROM estado WHERE id=1) AS por,
             (SELECT count(*) FROM archivos) AS archivos,
             (SELECT COALESCE(sum(tamano),0) FROM archivos) AS peso_archivos,
             (SELECT count(*) FROM historial) AS copias,
             pg_size_pretty(pg_database_size(current_database())) AS tamano_bd`);
    return json(res, 200, Object.assign(
      { ok: true, base: CONFIG.enLaNube ? 'en la nube' : CONFIG.bd.database }, r0, r.rows[0]));
  }

  return json(res, 404, { error: 'ruta no encontrada' });
}

function servirEstatico(req, res, ruta) {
  if (ruta === '/') ruta = '/index.html';
  // No se sale de la carpeta del panel
  const destino = path.join(CONFIG.raizWeb, path.normalize(ruta).replace(/^(\.\.[\/\\])+/, ''));
  if (!destino.startsWith(CONFIG.raizWeb)) { res.writeHead(403); return res.end('Prohibido'); }

  fs.readFile(destino, (err, datos) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(destino).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(datos);
  });
}

const servidor = http.createServer(async (req, res) => {
  const ruta = decodeURIComponent((req.url || '/').split('?')[0]);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Nombre');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {
    if (ruta.startsWith('/api/')) return await api(req, res, ruta);
    return servirEstatico(req, res, ruta);
  } catch (e) {
    console.error('[error]', ruta, e.message);
    json(res, 500, { error: e.message });
  }
});

/* ------------------------------- Arranque -------------------------------- */
/** Crea las tablas si la base está vacía: al desplegar en la nube no hay psql. */
async function prepararBase() {
  const sql = fs.readFileSync(path.join(__dirname, 'esquema.sql'), 'utf8');
  await pool.query(sql);
}

async function iniciar() {
  try {
    await pool.query('SELECT 1');
    await prepararBase();
  } catch (e) {
    console.error('\n  No se pudo preparar la base de datos: ' + e.message);
    if (!CONFIG.enLaNube) {
      console.error('  Revisa que el servicio de PostgreSQL esté iniciado.\n');
    } else {
      console.error('  Revisa la variable DATABASE_URL.\n');
    }
    process.exit(1);
  }

  servidor.listen(CONFIG.puerto, '0.0.0.0', () => {
    console.log('\n  ╭──────────────────────────────────────────────────────────╮');
    console.log('  │  Panel de Supervisión de Operaciones                     │');
    console.log('  ╰──────────────────────────────────────────────────────────╯\n');

    if (CONFIG.enLaNube) {
      console.log('  Escuchando en el puerto ' + CONFIG.puerto + ' · base de datos en la nube\n');
    } else {
      const ips = [];
      const redes = os.networkInterfaces();
      for (const nombre in redes) {
        for (const n of redes[nombre]) if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
      }
      console.log('  En este equipo:      http://localhost:' + CONFIG.puerto);
      ips.forEach(ip => console.log('  Para los demás:      http://' + ip + ':' + CONFIG.puerto));
      console.log('\n  Base de datos:       ' + CONFIG.bd.database + ' en ' + CONFIG.bd.host + ':' + CONFIG.bd.port);
      console.log('  Para detenerlo:      Ctrl+C\n');
      console.log('  Deja esta ventana abierta mientras otros consulten el panel.');
    }

    if (Auth.clavesPorDefecto()) {
      console.log('\n  ⚠  Estás usando las contraseñas de prueba:');
      console.log('       supervisor  → puede cargar y modificar');
      console.log('       equipo      → solo consulta');
      console.log('     Cámbialas con las variables CLAVE_EDITOR y CLAVE_CONSULTA');
      console.log('     antes de publicar el panel en internet.');
    }
    console.log('');
  });
}

iniciar();
