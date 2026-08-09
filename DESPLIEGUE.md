# Publicar el panel en internet

Al terminar tendrás **una dirección fija** que puedes enviarle a quien sea. Todos
verán la misma información, sin importar dónde estén ni si tu equipo está encendido.

- **Supabase** guarda la información (PostgreSQL gestionado)
- **Render** ejecuta el panel

Los dos tienen plan gratuito y no piden tarjeta.

> **Antes de empezar:** el panel manejará nombres, cédulas y evaluaciones de tus
> compañeros, y esa información quedará alojada fuera de la empresa. Valídalo con
> tu jefatura o con TI antes de publicarlo.

---

## 1. Crear la base de datos en Supabase

1. Entra a **supabase.com** y crea una cuenta (puedes usar tu cuenta de GitHub).
2. **New project**:
   - *Name*: `panel-operaciones`
   - *Database Password*: genera una y **guárdala**, la necesitas en el paso siguiente
   - *Region*: la más cercana (por ejemplo *East US*)
3. Espera un par de minutos a que el proyecto quede listo.
4. Arriba a la derecha, botón **Connect**.
5. En **Connection string** elige la pestaña **Session pooler** y copia la línea.
   Se ve así:

   ```
   postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   ```

6. Reemplaza `[YOUR-PASSWORD]` por la contraseña del paso 2. **Esa línea completa
   es tu `DATABASE_URL`.**

No hace falta crear tablas: el panel las crea solo la primera vez que arranca.

---

## 2. Publicar el panel en Render

1. Entra a **render.com** y crea la cuenta con **GitHub**.
2. **New → Web Service** y elige el repositorio `panel-supervision-operaciones`.
3. Render detecta la configuración del archivo `render.yaml`. Si te pide los
   datos a mano, usa estos:

   | Campo | Valor |
   |---|---|
   | Root Directory | `servidor` |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | `Free` |

4. En **Environment Variables**, agrega las tres:

   | Nombre | Valor |
   |---|---|
   | `DATABASE_URL` | la línea que copiaste de Supabase |
   | `CLAVE_EDITOR` | la contraseña con la que **tú** cargas información |
   | `CLAVE_CONSULTA` | la contraseña que le das a **quien solo mira** |

   Usa contraseñas largas y distintas entre sí. No reutilices las de la empresa.

5. **Create Web Service** y espera a que termine (2-3 minutos).

Tu dirección queda como:

```
https://panel-supervision-operaciones.onrender.com
```

---

## 3. Usarlo

1. Entra tú con la **clave de editor** y carga el informe y la malla como siempre.
2. Envíale a tu equipo la dirección y la **clave de consulta**.

Ellos verán exactamente lo que cargaste, pero **no podrán cargar, editar ni
borrar nada**: se les ocultan las pestañas de carga, los botones de edición y las
acciones de Ajustes. En la barra superior aparece «👁 Solo consulta».

Cuando cargues algo nuevo, a quien tenga la página abierta le sale un aviso con
un botón para actualizar.

---

## Cosas que conviene saber del plan gratuito

**Render duerme el servicio tras 15 minutos sin visitas.** La primera persona que
entre después de un rato esperará entre 30 y 60 segundos a que despierte. Las
siguientes entran al instante. Avísale a tu equipo para que no crean que falló.

**Supabase pausa el proyecto tras una semana sin actividad.** Si eso pasa, entra a
supabase.com y pulsa *Restore*; la información no se pierde. Con uso semanal no
ocurre.

**Cambiar las contraseñas:** en Render, *Environment* → editas la variable →
*Save*. El servicio se reinicia solo y todos deben volver a entrar.

---

## Respaldos

Aunque Supabase guarda copias, conviene que tengas las tuyas:

- **Ajustes → Descargar respaldo completo** genera un `.json` con todo.
- La base guarda además las **50 últimas versiones** en la tabla `historial`, por
  si hay que deshacer una carga equivocada.

---

## Seguir usándolo dentro de la oficina

El modo local sigue funcionando igual: `Iniciar panel.bat` levanta el panel contra
el PostgreSQL de tu equipo. Son dos instalaciones independientes con información
separada; para pasar datos de una a otra, usa el respaldo `.json`.
