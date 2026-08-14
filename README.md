# Panel de Supervisión de Operaciones

Herramienta web para supervisores de operaciones: rendimiento diario de los agentes,
mallas de turnos con cobertura por skill y una base de conocimiento con procesos y PDF.

**Todo funciona en el navegador.** Los archivos que cargas se leen en tu equipo y la
información se guarda localmente: nada viaja a internet ni a ningún servidor.

---

## Tres formas de usarlo

### 1. En línea — una dirección para todos

**GitHub Pages + Supabase**, sin servidores de por medio: una dirección fija que
funciona desde cualquier lugar, aunque tu equipo esté apagado. Se entra con
usuario y contraseña, y hay dos perfiles: **editor** (carga y modifica) y
**consulta** (solo mira). Cuando cargas un informe, a quien tenga la página
abierta le llega el aviso en el momento.

Los pasos están en **[DESPLIEGUE.md](DESPLIEGUE.md)**.

### 2. Compartido en la red de la oficina

Con el servidor encendido, la información se guarda en **PostgreSQL** y todos
los que abran la dirección desde la red ven exactamente lo mismo.

```
Doble clic en  "Iniciar panel.bat"
```

La ventana que se abre indica dos direcciones:

- `http://localhost:3000` → para ti, en este equipo
- `http://<tu-ip>:3000` → la que le pasas a tu equipo

Deja esa ventana abierta mientras los demás consulten. Cuando cargues un informe,
a los que tengan el panel abierto les aparece un aviso de «hay información nueva»
con un botón para actualizar.

**La primera vez**, permite el puerto en el firewall de Windows (una sola vez,
en PowerShell **como administrador**):

```powershell
netsh advfirewall firewall add rule name="Panel Operaciones" dir=in action=allow protocol=TCP localport=3000
```

Requisitos: PostgreSQL y Node.js instalados en el equipo que hace de servidor.
La base se crea con `servidor/esquema.sql`.

### 3. Solo en tu equipo

Abriendo `index.html` directamente, o desde el enlace publicado en GitHub Pages.
Todo queda en el navegador de ese equipo y **no lo ve nadie más**. Sirve para
consultar sin depender del servidor, o para trabajar desde casa.

En cualquiera de los dos modos, la etiqueta de la barra superior indica dónde se
está guardando la información.

---

## Primeros pasos

1. En **Ajustes → Cargar datos de ejemplo** puedes ver cómo funciona antes de subir información real.
2. Cuando quieras empezar de cero: **Ajustes → Borrar toda la información**.
3. **Ajustes → Descargar respaldo completo** guarda una copia de todo en un archivo.

---

## Las secciones

### 📈 Rendimiento
Indicadores diarios del equipo.

| Pestaña | Para qué sirve |
|---|---|
| Panel general | Puntaje global, tendencia diaria, cumplimiento contra meta, mejores y peores 5 |
| Ranking | Tabla completa ordenada por puntaje, exportable a CSV |
| Por skill | Comparativo entre skills y evolución diaria de cada uno |
| Detalle de datos | Todos los registros; doble clic en un valor para corregirlo |
| Cargar datos | Carga manual o por Excel/CSV, con plantilla descargable |
| Indicadores y metas | Define qué mides, la meta, si "mejor" es más o menos, y el peso en el puntaje |

Los indicadores son configurables: si agregas uno nuevo, aparece automáticamente
como columna en la carga, como campo del formulario manual y como gráfico.

### 👤 Por agente
La sección para el seguimiento individual.

- **Gráficos individuales**: agrega los agentes que quieras y cada uno recibe su
  propia tarjeta con su gráfico, su promedio, su mejor día y su puntaje.
  Puedes ordenar las tarjetas por nombre, por mejor o por menor cumplimiento.
- **Filtro por skill**: elige un segmento y solo verás a sus agentes. Con «Todos»,
  las tarjetas se agrupan bajo el encabezado de cada skill, que muestra cuántos
  agentes tiene y su promedio contra la meta.
- **Ficha completa**: un gráfico por cada indicador del agente, más su posición
  en el ranking y su detalle diario.
- **Comparar agentes**: hasta 6 en un mismo eje para que las líneas sigan siendo distinguibles.

### 🗓 Turnos
Mallas de programación y cobertura real.

- **Cobertura por skill**: cuántos asesores quedan conectados en cada franja
  (15, 30 o 60 minutos), descontando pausas. Incluye mapa de calor skill × hora.
- **Malla del día**: línea de tiempo por asesor con sus pausas, y tabla editable.
- **Vista semanal**: personal programado por día y cuadro semanal por asesor.
- **Cargar malla**: importa el Excel de programación.
- **Requerido por franja**: define cuánto personal necesitas por skill y hora;
  el panel calcula el déficit o superávit contra la malla.

Tres formas de contar la cobertura:
`conectados reales` (descuenta todas las pausas) · `descontar solo almuerzo` · `turno completo`.

### 📚 Conocimientos
La documentación operativa, organizada por skill.

- **Títulos** que agrupan procesos, cada uno asignado al **skill** al que pertenece.
  Los que se dejan en «General» aparecen con cualquier skill.
- Dentro de cada título, los **procesos** con sus notas paso a paso y sus etiquetas.
- A cada proceso se le adjuntan **PDF**, que se ven dentro del panel o se descargan.
- **Filtro por skill**: muestra solo la documentación del segmento elegido. Con
  «Todos», la biblioteca se agrupa por skill.
- Buscador que revisa títulos, skills, procesos, notas, etiquetas y nombres de archivo.

> **De dónde salen los skills:** son los segmentos de tu malla (la columna `Servicio`:
> INB, OUT, EMAIL, CHAT, PQR, RRSS, BACKOFFICE, MONITOREO TRANSACCIONAL…). El panel
> determina el skill de cada agente por la programación que tiene en el horario; si
> alguien no aparece en la malla, usa el servicio de su reporte de indicadores.

---

## Formato de los archivos

### Malla de turnos

El panel reconoce automáticamente el formato estándar de programación y elige
la hoja correcta cuando el libro trae varias:

| Columna | Se reconoce como |
|---|---|
| `Fecha` | Día de la programación |
| `Documento` / `cedula` | Identificación del asesor |
| `Nombre Agente` / `nombre_completo` | Nombre |
| `Servicio` | Skill |
| `Novedad` | `TUR` turno · `DES` descanso · `VAC` vacaciones · `INC` incapacidad · `CAP` capacitación · `AUS` ausencia |
| `Turno_Ini` / `Turno_Fin` | Entrada y salida |
| `Des_1_Ini` … `Lunch_Ini` … | Pausas, detectadas automáticamente por pares `_Ini` / `_Fin` |
| `Horas_Laboradas` | Referencia informativa |

Detalles que ya están resueltos:

- Cualquier par de columnas `X_Ini` / `X_Fin` se toma como pausa: `Des_1`, `Des_2`,
  `Des_3`, `Lunch`, `Training_1`, `Lac`, `Dialogo`…
- `00:00` – `00:00` significa "no aplica" y se ignora.
- Los turnos que cruzan medianoche se calculan en el día correcto.
- Si la malla solo trae el documento, el nombre se completa cruzando con la hoja de planta del mismo libro.
- Al importar puedes **elegir qué días cargar**, marcando o desmarcando las fechas encontradas.

### Informe de operaciones (con metas)

Es el formato que se reconoce solo, sin configurar nada. El panel identifica que
cada indicador ocupa **tres columnas seguidas**:

| … | Resultado del agente | Meta | Cumple |
|---|---|---|---|
| ejemplo | `AHT` = 583,80 | `Meta AHT` = 380 | *(se omite)* |

- Da igual el orden dentro de la tripleta: el panel reconoce cuál es la meta por
  su nombre, así que `Meta_Error Oper inb · Errores Operacionales Inb · Cumple…`
  funciona igual que `Nota Calidad · Meta Calidad · Cumple Calidad`.
- Las columnas **«Cumple» se ignoran**; el cumplimiento lo recalcula el panel.
- **La meta se guarda agente por agente**, no como un valor global: si dos
  asesores tienen metas distintas, cada uno se evalúa contra la suya.
- Deduce solo la **unidad** (porcentaje, tiempo, número) y si el indicador es
  mejor cuando **sube** (calidad, FCR, NPS) o cuando **baja** (AHT, errores,
  ausentismo, desconexiones). Puedes corregirlo antes de importar.
- Una meta de **0** (cero errores) se evalúa como cumple / no cumple.
- Las columnas numéricas **sin meta** (llamadas contestadas, días con gestión)
  entran como datos informativos: se ven, pero no puntúan.
- El periodo sale de las columnas `Año` y `Mes`.
- Los agentes se identifican por `cedula` y `nombre_completo`. **El nombre del
  informe manda**: si esa cédula está en la malla con un nombre antiguo, se
  unifica automáticamente para no duplicar a la misma persona.

**El skill no viene como columna**: lo aporta el archivo o la hoja. El panel lo
deduce del nombre (`…Performance_Inbound` → `INB`, `Chat` → `CHAT`,
`Correos` → `EMAIL`…) y puedes cambiarlo antes de importar. Si el libro trae
varias hojas —inbound, chat y correos—, se pueden importar todas de una vez y
cada una queda con su skill.

### Otro formato de indicadores

Cualquier tabla con encabezados sirve: columnas mínimas `Fecha` y `Agente`, y el
resto los indicadores que tengas configurados. Descarga la plantilla desde
**Rendimiento → Cargar datos → Descargar plantilla CSV**.

Los porcentajes se aceptan como `92,5` o como `0,925` (se detecta solo), y los
tiempos como `05:30`, `00:05:30` o en segundos.

---

## Detalles técnicos

- HTML, CSS y JavaScript puros. **Sin dependencias ni conexión a internet.**
- Los `.xlsx` se leen con un descompresor ZIP y un lector de XML propios
  (`assets/js/sheets.js`), así que no hace falta ninguna librería externa.
- Los datos se guardan en IndexedDB, con `localStorage` como alternativa.
- Gráficos en SVG generado a mano, con paleta verificada para daltonismo en
  modo claro y oscuro; cada gráfico tiene su vista de tabla equivalente.

```
index.html
Iniciar panel.bat        arranca el servidor compartido
assets/
  css/styles.css
  js/core.js             estado, almacenamiento, navegación, utilidades
     sheets.js           lector de Excel/CSV y mapeador de columnas
     informe.js          lectura del informe de operaciones con metas
     charts.js           gráficos SVG
     rendimiento.js      indicadores del equipo
     agentes.js          seguimiento individual
     turnos.js           mallas y cobertura
     conocimientos.js    procesos y PDF
     demo.js             datos de ejemplo
servidor/
  server.js              servidor HTTP + API sobre PostgreSQL
  esquema.sql            tablas y vistas de la base de datos
```

### La base de datos

Todo el contenido del panel se guarda como `jsonb` en la tabla `estado`, y los
PDF en `archivos`. Cada guardado deja una copia en `historial` (se conservan las
50 últimas). Para no pisar el trabajo de otro, quien guarda envía la versión que
tenía: si alguien se le adelantó, recibe un aviso en lugar de sobrescribir.

Aunque el contenido viaje en JSON, hay **vistas SQL** para consultarlo con
consultas normales:

| Vista | Qué devuelve |
|---|---|
| `v_indicadores` | Los indicadores con su meta, unidad, dirección y peso |
| `v_resultados` | Una fila por agente e indicador, con su valor y su meta |
| `v_resultados_detalle` | Lo anterior más el nombre del indicador y el % de cumplimiento |
| `v_puntajes` | Puntaje por agente, ya ponderado |
| `v_turnos` | La malla, con las horas de cada turno |

```sql
-- Los agentes de INB por debajo del 90 %
SELECT agente, puntaje FROM v_puntajes WHERE skill = 'INB' AND puntaje < 90 ORDER BY puntaje;
```

## Privacidad

Este repositorio contiene **solo el código**. Las mallas, los reportes de
indicadores y los PDF nunca se suben: el `.gitignore` bloquea `.xlsx`, `.csv`,
`.pdf` y los respaldos para evitar publicar datos personales por accidente.

La base de datos vive únicamente en el equipo que hace de servidor, y solo es
accesible desde la red interna. **No la expongas a internet**: el panel no tiene
usuarios ni contraseñas, así que cualquiera con acceso a la red y a la dirección
puede ver y modificar la información.
