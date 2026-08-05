# Panel de Supervisión de Operaciones

Herramienta web para supervisores de operaciones: rendimiento diario de los agentes,
mallas de turnos con cobertura por skill y una base de conocimiento con procesos y PDF.

**Todo funciona en el navegador.** Los archivos que cargas se leen en tu equipo y la
información se guarda localmente: nada viaja a internet ni a ningún servidor.

---

## Cómo se usa

1. Abre el enlace del panel (o el archivo `index.html` si trabajas sin conexión).
2. En **Ajustes → Cargar datos de ejemplo** puedes ver cómo funciona antes de subir información real.
3. Cuando quieras empezar de cero: **Ajustes → Borrar toda la información**.

> Como todo se guarda en el navegador, usa **Ajustes → Descargar respaldo completo**
> con frecuencia y para pasar el panel a otro computador.

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
assets/
  css/styles.css
  js/core.js            estado, almacenamiento, navegación, utilidades
     sheets.js          lector de Excel/CSV y mapeador de columnas
     charts.js          gráficos SVG
     rendimiento.js     indicadores del equipo
     agentes.js         seguimiento individual
     turnos.js          mallas y cobertura
     conocimientos.js   procesos y PDF
     demo.js            datos de ejemplo
```

## Privacidad

Este repositorio contiene **solo el código**. Las mallas, los reportes de
indicadores y los PDF nunca se suben: el `.gitignore` bloquea `.xlsx`, `.csv`,
`.pdf` y los respaldos para evitar publicar datos personales por accidente.
