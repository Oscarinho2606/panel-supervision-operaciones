# Publicar el panel para todo el equipo

Al terminar tendrás **una dirección fija** que puedes enviarle a quien sea. Todos
verán la misma información al instante, sin instalar nada y sin que tu equipo
tenga que estar encendido.

- **GitHub Pages** entrega la página
- **Supabase** guarda la información

Los dos son gratuitos y no piden tarjeta.

> **Antes de empezar:** el panel manejará nombres, cédulas y evaluaciones de tus
> compañeros, alojados fuera de la empresa. Valídalo con tu jefatura o con TI.
> El acceso queda protegido con usuario y contraseña, y quien no haya entrado no
> ve absolutamente nada.

---

## 1. Crear el proyecto en Supabase

1. Entra a **supabase.com** → **Start your project** (puedes usar tu cuenta de GitHub).
2. **New project**:
   - *Name*: `panel-operaciones`
   - *Database Password*: genera una y guárdala
   - *Region*: la más cercana (por ejemplo *East US*)
3. Espera un par de minutos.

## 2. Crear las tablas

1. Menú lateral → **SQL Editor** → **New query**.
2. Abre el archivo [`supabase/esquema.sql`](supabase/esquema.sql), copia **todo**
   su contenido, pégalo y pulsa **Run**.

Eso crea las tablas, los permisos, el depósito de PDF y las vistas de consulta.
Puedes volver a ejecutarlo cuando quieras: no borra nada.

## 3. Crear los usuarios

1. Menú lateral → **Authentication** → **Users** → **Add user** → *Create new user*.
2. Crea **el tuyo** con tu correo y una contraseña. Marca **Auto Confirm User**.
3. Crea los de tu equipo igual (o uno solo compartido, como prefieras).

Todos entran como **solo consulta**. Para darte a ti permiso de cargar, ve a
**SQL Editor** y ejecuta, con tu correo:

```sql
insert into panel_editores (correo, nota) values ('tucorreo@empresa.com', 'Supervisor') on conflict (correo) do nothing;
```

Para ver quién tiene qué permiso:

```sql
select correo, nota from panel_editores order by correo;
```

## 4. Conectar el panel

1. En Supabase: **Settings** (el engranaje) → **API**. Copia dos cosas:
   - **Project URL**
   - **anon public** (la clave larga)
2. En este repositorio, abre `assets/js/config.js` y ponlas:

```js
const SUPABASE = {
  URL:   'https://abcdefgh.supabase.co',
  CLAVE: 'eyJhbGciOi...'
};
```

3. Guarda y sube el cambio a GitHub.

> Esa clave *anon* está pensada para ir en la página: por sí sola no sirve de
> nada, porque las tablas exigen haber entrado con usuario y contraseña.

## 5. Listo

Tu dirección es la de GitHub Pages:

```
https://oscarinho2606.github.io/panel-supervision-operaciones/
```

Entras con tu correo y contraseña, cargas los Excel, y le pasas a tu equipo esa
misma dirección con su usuario. Verán lo mismo que tú.

**Cuando cargues algo nuevo, a quien tenga la página abierta le aparece un aviso
en el momento**, con un botón para ver lo último. No hace falta que recarguen.

Quien entre como *consulta* no ve las pestañas de carga ni los botones de editar
o borrar, y aunque lo intentara por otro medio, la base de datos rechaza el
cambio.

---

## Preguntas frecuentes

**¿Y si alguien más carga a la vez que yo?**
El que guarde de segundo recibe un aviso de que hubo cambios y debe recargar
antes de continuar, así no se pisa el trabajo.

**¿Se puede deshacer una carga equivocada?**
Sí. La tabla `panel_historial` guarda las 50 últimas versiones:

```sql
select id, version, guardado, guardado_por from panel_historial order by id desc limit 10;
-- para volver a una anterior:
update panel_estado set datos = (select datos from panel_historial where id = 123), version = version + 1 where id = 1;
```

**¿Supabase se apaga si no lo uso?**
El plan gratuito pausa el proyecto tras una semana sin actividad. Se reactiva con
un botón desde supabase.com y no se pierde nada.

**¿Puedo seguir usándolo sin internet?**
Sí. Abriendo `index.html` directamente en tu equipo funciona con el
almacenamiento del navegador, aparte de la nube.

---

## Consultar los datos con SQL

Dentro de Supabase, en el **SQL Editor**:

```sql
-- Puntaje de cada agente
select * from v_puntajes order by puntaje;

-- Los de INB por debajo del 90 %
select agente, puntaje from v_puntajes where skill = 'INB' and puntaje < 90 order by puntaje;

-- Detalle de un indicador
select agente, valor, meta, round(cumplimiento_pct,1) as cumple
from v_resultados_detalle where indicador = 'AHT' order by cumplimiento_pct;
```
