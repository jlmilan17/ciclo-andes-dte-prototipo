# Especificación de ejecución — Prototipo funcional end-to-end del MVP DTE (Ciclo Andes)

> **Destinatario:** Claude Code.
> **Proyecto:** Práctica Profesional (UCA) — Sistema web de Punto de Venta, Inventario y Facturación Electrónica (DTE) para MIPYMES salvadoreñas.
> **Objetivo:** construir un prototipo **realmente funcional** (frontend + backend + simulador del Ministerio de Hacienda) que ejecute de punta a punta los 8 flujos de demostración, genere y muestre dentro de la aplicación todos los DTE y documentos internos, y persista el estado.
> **Idioma:** interfaz y documentos en español (es-SV). Código, commits y nombres de ramas en inglés. Los campos de los DTE conservan los nombres del esquema del MH (`numeroControl`, `codigoGeneracion`, `selloRecepcion`, etc.).

---

## 0. ARRANQUE — HAZ ESTO PRIMERO, EN ESTE ORDEN

### 0.1 Crear el repositorio

1. En el directorio de trabajo actual, crea la carpeta `ciclo-andes-dte-prototipo` y entra en ella.
2. Ejecuta `git init -b main`.
3. Copia este archivo a `docs/SPEC.md` (es la fuente de verdad del proyecto; consúltalo en cada entrega).
4. Crea `README.md`, `.gitignore` (node_modules, dist, `.env`, `*.db`, `*.p12`, `*.pem`, `coverage`, `playwright-report`), `.editorconfig` y `.env.example`.
5. Haz el commit inicial: `chore: initialize repository with project spec`.

### 0.2 Remoto y Pull Requests

1. Verifica `gh auth status`.
   - **Si `gh` está autenticado:** crea el repositorio remoto como **privado** (`gh repo create ciclo-andes-dte-prototipo --private --source=. --push`). Nunca lo crees público.
   - **Si `gh` no está disponible o no está autenticado:** detente y pregunta al usuario una sola vez por la URL del remoto. Si no hay remoto, trabaja igual con ramas locales y deja la descripción de cada PR en `docs/prs/NN-nombre.md`, haciendo `git merge --no-ff` a `main` localmente.
2. No hay política de revisión externa: el usuario es dueño del repo. Aun así, **nunca hagas push directo a `main`** ni reescribas su historia (sin `--force`, sin `rebase` de `main`).

### 0.3 Flujo de entregas continuas

- Una rama por entrega, partiendo de `main` actualizado: `feat/<alcance>`, `fix/<alcance>`, `chore/<alcance>`, `test/<alcance>`.
- **Commits pequeños y frecuentes** con Conventional Commits: `feat(pos): ...`, `fix(tax): ...`, `test(dte): ...`, `docs: ...`, `chore: ...`. Un commit = un cambio coherente. No acumules horas de trabajo en un solo commit.
- Al terminar cada entrega (ver sección 14):
  1. Corre lint, typecheck y tests (`npm run verify`). Si fallan, corrige antes de abrir el PR.
  2. Abre el PR contra `main` con la plantilla de la sección 0.4.
  3. Si todo está en verde, haz **squash merge**, actualiza `main` local y arranca la siguiente rama.
  4. Al cerrar cada entrega, escribe al usuario un resumen de máximo 5 líneas: qué quedó, qué se puede probar ya (con el comando exacto) y qué decisión pendiente apareció, si la hubo.
- Mantén `docs/DECISIONES.md` (registro de decisiones) y `docs/ZONAS-GRISES.md` actualizados. Ver sección 2.

### 0.4 Plantilla de PR (`.github/pull_request_template.md`)

```
## Qué entrega
<una frase>

## Requerimientos cubiertos
<IDs de la sección 5 y 6, p. ej. RF-CCFE-01, PRT-POS-03>

## Cómo probarlo
<comandos y pasos exactos>

## Evidencia
<tests ejecutados / capturas / salida del flujo>

## Zonas grises tocadas
<referencias a docs/ZONAS-GRISES.md, o "ninguna">

## Fuera de alcance de este PR
<lo que se dejó para la siguiente entrega>
```

---

## 1. CONTEXTO Y OBJETIVO

**Negocio ficticio:** Ciclo Andes, S.A. de C.V. — venta y taller de bicicletas, San Salvador. NIT `0614-120598-102-3` · NRC `245891-8` · Establecimiento `M001` · Punto de venta `P001` · Giro: venta al por menor de bicicletas, repuestos y accesorios.

**Naturaleza del producto.** No es un POS genérico con facturación agregada: **su núcleo es la máquina de estados del DTE**. Toda decisión de diseño y de código gira alrededor de ella (sección 4). Si una pantalla muestra un DTE, muestra su estado.

**Qué cambia respecto al prototipo anterior.** El prototipo previo (Figma y luego Claude Design) simulaba únicamente la interfaz. Este es un sistema que funciona: backend real con autenticación y RBAC verificados en servidor, base de datos persistente, motor tributario con cálculos reales, generación de JSON de DTE, firma JWS con certificado de pruebas, **un simulador del API del Ministerio de Hacienda** con comportamiento controlable, cola de contingencia con worker en segundo plano, y generación de PDF y tickets.

**Lo que sigue siendo simulado (y debe decirse así en la UI y el README):** el MH (no se conecta a ningún servicio gubernamental real), el certificado de firma (es de pruebas, autogenerado), el padrón de NRC (lista local), las pasarelas de tarjeta (el POS bancario es externo; solo se registra el método), la impresora térmica (vista previa) y el envío de correo (se guarda en una bandeja de salida local).

**Rol del Product Owner y de la demostración.** El prototipo debe poder demostrarse en vivo. El flujo **F3 (Contingencia)** es el más importante: el presentador enciende un interruptor de caída de conexión, cierra ventas sin que el sistema se trabe, restablece la conexión y ve los documentos transmitirse y sellarse.

---

## 2. ZONAS GRISES — NO LAS RESUELVAS EN SILENCIO

La documentación del proyecto tiene vacíos e inconsistencias reales. **No los rellenes como si estuvieran definidos.** Para cada uno, implementa la opción indicada (es provisional), regístrala en `docs/ZONAS-GRISES.md` con el estado "pendiente de decisión del equipo", y muestra en la UI una nota discreta de "supuesto de demostración" donde afecte lo que ve el usuario.

| # | Zona gris | Qué hacer en el prototipo |
|---|---|---|
| ZG-01 | **Motor de base de datos:** la Propuesta indicaba PostgreSQL y el documento SCRUM v2.0 indicaba MySQL. | **RESUELTA por el equipo: se usa PostgreSQL.** Versión 16 o superior, ejecutada en Docker Compose para desarrollo, pruebas y demostración. Migraciones versionadas en `server/db/migrations`. Registrar en `docs/DECISIONES.md` como decisión tomada. Queda pendiente, y fuera del alcance del prototipo, que el equipo corrija el documento SCRUM v2.0, que aún dice MySQL. |
| ZG-02 | **FCFE sin ficha formal** en Requerimientos.docx (aparece en el alcance y en el plan de pruebas). | Tratarla como un CCFE sin datos de contribuyente y sin retención. Mismos precios netos y IVA 13% desglosado. Anotar que en la práctica el precio de consumidor final suele incluir el IVA; pendiente de confirmar. |
| ZG-03 | **No existe ficha del proceso de venta y descuento de stock** (la numeración salta de SRS-REQ-VTA-002 a VTA-003). | Implementar el POS según los PRT-POS-xx de la sección 6, marcados como "requerimiento propuesto". |
| ZG-04 | **Dashboard y reportes sin requerimiento.** | Implementar el resumen mínimo de PRT-ADM-01 como propuesta de diseño. Es lo primero que se recorta si hay presión de tiempo. |
| ZG-05 | **Kardex** solo aparece en los casos de prueba (CP-1.2). | Registrar siempre los movimientos de inventario (lo exige SRS-REQ-INV-003). La pantalla de Kardex es opcional (P2) y se marca como fuera de los requerimientos formales. |
| ZG-06 | **Retención 1%: ¿emisor o receptor?** La ficha SRS-REQ-DTE-003 dice "el emisor es Gran Contribuyente"; las reglas de negocio del equipo y los prompts dicen "el cliente (receptor) es Gran Contribuyente". | Aplicar la regla del equipo: retención cuando **gravado > $100.00 Y el receptor es Gran Contribuyente**. Hacerla configurable (`RETENTION_APPLIES_TO=receptor`) y documentar la discrepancia. |
| ZG-07 | **Plazo legal de invalidación sin valor numérico** en la ficha. | Parámetro configurable `INVALIDATION_WINDOW_HOURS` con valor provisional marcado como "PENDIENTE DE VALIDAR CONTRA NORMATIVA". Debe haber un DTE semilla fuera de plazo que demuestre el bloqueo. No afirmar en la UI un plazo como si fuera ley. |
| ZG-08 | **Límite de documentos por lote** sin valor (RNF-LOT-02 solo dice "restricciones técnicas gubernamentales"). | Parámetro configurable `BATCH_MAX_DOCUMENTS` con valor provisional (100) y nota de pendiente. |
| ZG-09 | **El bloqueo de cuenta tras 3 intentos fallidos no está en ninguna ficha.** SRS-REQ-SEG-002 solo cubre JWT, roles y expiración. | Implementarlo (es útil para la demostración) pero registrarlo como "propuesta del equipo, no requerimiento formal". |
| ZG-10 | **Comportamiento de NCE e invalidación sin conexión.** RNF-NCE-02 manda encolar la NCE; para invalidación la ficha no dice nada. | NCE: se encola en contingencia. Invalidación: **requiere conexión**; si el MH está caído, se bloquea con mensaje claro. Registrar como decisión provisional. |
| ZG-11 | **Esquema JSON oficial del MH.** | Generar JSON con la estructura de los DTE salvadoreños tal como la conoces, pero **sin afirmar conformidad**. Aislar el esquema en `server/dte/schemas/` para poder ajustarlo contra la documentación técnica oficial. Marcar en la UI "estructura de demostración". |
| ZG-12 | **Redondeo.** Las reglas oficiales de redondeo por línea o por documento no están documentadas. | Aritmética entera en centavos; IVA y retención se calculan sobre el gravado total del documento con redondeo half-up a 2 decimales. Documentarlo. |
| ZG-13 | **Roadmaps divergentes** (SCRUM vs. Propuesta). | No afecta al código. Seguir el de la Propuesta, que es el más reciente. |
| ZG-14 | **Maqueta visual acordada con la catedrática.** La sección "Propuesta de interfaz gráfica" de la Propuesta son imágenes no leídas. | Si el usuario aporta una maqueta, **manda sobre la sección 12**. Mientras tanto aplica los tokens de la sección 12. |

**Regla general:** ante una ambigüedad nueva que no esté aquí, elige la opción más conservadora, regístrala como `ZG-nn` y sigue. No te detengas a menos que bloquee todo el avance.

---

## 3. REGLAS DE NEGOCIO (INVARIANTES — DEBEN TENER PRUEBAS)

1. **IVA 13%** sobre el monto gravado.
2. **Retención 1%** solo si `gravado > 100.00` **Y** el receptor es Gran Contribuyente. Ambas condiciones a la vez.
3. `Total = gravado + IVA − retención`. Ejemplo canónico que debe reproducirse exactamente: gravado `578.00`, IVA `75.14`, retención `5.78`, total `647.36`.
4. Agregar más unidades que el stock disponible **dispara alerta y bloquea la adición**; el carrito conserva la cantidad anterior. Validar también en el servidor.
5. **NRC inválido bloquea** la emisión de CCFE, con mensaje explícito: *"El NRC no está registrado en el padrón del Ministerio de Hacienda. No se puede emitir crédito fiscal con este dato."*
6. **La contingencia no bloquea al cajero:** si el MH no responde, la venta se cierra localmente, el DTE queda firmado y `ENCOLADO`, y la terminal sigue operando.
7. **El Corte Z bloquea la terminal** hasta una nueva apertura de caja. La terminal bloqueada rechaza ventas también en el backend.
8. **Una NCE no puede exceder el monto del documento original**, solo puede referenciar DTE en estado `PROCESADO`, revierte impuestos de forma proporcional y **reintegra el stock**.
9. **La invalidación fuera del plazo legal se bloquea en la propia interfaz** (botón deshabilitado con explicación) **y** en el backend. Revierte el movimiento de inventario y deja registro inmutable.
10. **RBAC visible y real:** el Cajero nunca ve Catálogo, Resumen, Usuarios ni la acción Invalidar, y el backend responde `403` si intenta llamar a esas rutas directamente.
11. **Montos con precisión de dos decimales**, siempre en centavos enteros internamente.
12. **Los precios del catálogo son netos (sin IVA).**

---

## 4. MÁQUINA DE ESTADOS DEL DTE

```
BORRADOR ──► FIRMADO ──► TRANSMITIDO ──► PROCESADO ──► INVALIDADO
                │             │
                │             └──► RECHAZADO
                └──► ENCOLADO (sin conexión con el MH) ──► TRANSMITIDO ──► PROCESADO | RECHAZADO
```

| Estado | Significado | Color / chip |
|---|---|---|
| `BORRADOR` | Documento armado, aún sin firma | neutro |
| `FIRMADO` | JSON firmado con JWS, aún no enviado | neutro oscuro |
| `ENCOLADO` | Firmado y retenido localmente por falta de conexión con el MH | ámbar |
| `TRANSMITIDO` | Enviado al MH, esperando respuesta | azul/pizarra |
| `PROCESADO` | El MH lo validó y devolvió `selloRecepcion` | verde sello |
| `RECHAZADO` | El MH lo validó y devolvió error | granate |
| `INVALIDADO` | Anulado mediante evento de invalidación sellado | granate |

**Reglas de implementación:**
- Una **única** función `transition(dte, to, actor, reason)` en `server/dte/stateMachine.ts` es la única vía para cambiar el estado. Rechaza transiciones no permitidas con un error tipado.
- Cada transición escribe una fila en `dte_event` (bitácora inmutable: estado origen, destino, actor, timestamp, motivo, payload de respuesta del MH si aplica). Esa tabla es solo de inserción (sin UPDATE ni DELETE, reforzado con triggers o con ausencia de métodos en el repositorio).
- `RECHAZADO` no se reanima: la corrección genera un **nuevo** DTE con un nuevo `codigoGeneracion` que referencia al rechazado (ZG registrada como decisión provisional). Es la pantalla P1 "DTE rechazado".
- Pruebas exhaustivas de la matriz de transiciones (permitidas y prohibidas).

---

## 5. REQUERIMIENTOS FORMALES (Requerimientos.docx) Y SU IMPLEMENTACIÓN

Fuente: `Requerimientos.docx`, 23 de mayo de 2026 (IEEE 830/380). Cada fila indica qué debe hacer el prototipo funcional. Todos son obligatorios salvo indicación.

### 5.1 SRS-REQ-DTE-003 — Emisión de CCFE (Prioridad Alta)

| ID | Requerimiento | Implementación en el prototipo |
|---|---|---|
| RF-CCFE-01 | Calcular 13% de IVA sobre el gravado | Módulo `server/domain/tax.ts` (puro, con pruebas), reutilizado en el cliente para el recálculo en vivo |
| RF-CCFE-02 | Aplicar retención 1% según reglas | Misma función; depende de gravado y tipo de contribuyente del receptor (ZG-06) |
| RF-CCFE-03 | Generar el JSON exacto del MH para CCFE | `server/dte/builders/ccfe.ts` produce el JSON y lo valida con un esquema (zod/ajv) en `server/dte/schemas/`. Visible y descargable (ZG-11) |
| RNF-CCFE-01 | Firma y envío en ≤ 3 s | Medir el tiempo del pipeline; mostrarlo en la pantalla de venta confirmada y en el detalle. Si supera 3 s (modo `LENTO` del simulador) se muestra aviso y la política de contingencia entra por *timeout* |
| RNF-CCFE-02 | Dos decimales | Centavos enteros; columnas numéricas con escala fija |
| Criterio de fallo | NRC inválido bloquea | Validación contra el padrón local (`GET /api/padron/nrc/:nrc`) tanto en el alta de cliente como al emitir; error con el mensaje de la regla 5 |

### 5.2 SRS-REQ-DTE-004 — Nota de Crédito Electrónica (Prioridad Media-Alta)

| ID | Requerimiento | Implementación |
|---|---|---|
| RF-NCE-01 | Buscar y vincular un DTE previo por UUID | Búsqueda por `codigoGeneracion` o `numeroControl` en la pantalla de NCE; solo DTE `PROCESADO` |
| RF-NCE-02 | Revertir impuestos proporcionalmente | Cálculo por ítems y cantidades devueltas, con IVA y retención proporcionales |
| RF-NCE-03 | Reintegrar el stock físicamente | Movimiento de inventario tipo `DEVOLUCION` que suma existencias |
| RNF-NCE-01 | FK inmutable al DTE original | `dte.referenced_dte_id` con restricción de clave foránea y sin UPDATE posterior |
| RNF-NCE-02 | Contingencia si falla el MH | La NCE entra al mismo ciclo `FIRMADO → ENCOLADO → …` |
| Criterio de fallo | Monto mayor al original rechazado | Validación en cliente (bloqueo con aviso) y en servidor (`422`). Considerar NCE parciales previas: el acumulado de NCE no puede superar el original |

### 5.3 SRS-REQ-DTE-005 — Evento de Invalidación (Prioridad Alta)

| ID | Requerimiento | Implementación |
|---|---|---|
| RF-INV-01 | Catálogo de motivos autorizados | Tabla `motivo_invalidacion` con: Error en la información del documento · Rescindir la operación realizada · Otro (con observaciones obligatorias) |
| RF-INV-02 | Revertir movimiento de inventario | Movimiento `REVERSION_INVALIDACION` que repone el stock |
| RF-INV-03 | Estado a `INVALIDADO` | Mediante `transition()`; el cambio es visible también en el historial |
| RNF-INV-01 | Solo administradores | Middleware RBAC + acción ausente de la UI del Cajero |
| RNF-INV-02 | Registro inmutable (quién, cuándo, por qué) | `dte_event` + `audit_log` de solo inserción |
| Criterio de fallo | Fuera de plazo, bloqueado | Botón deshabilitado en UI con la explicación y `409` en backend (ZG-07). Construir JSON del **evento de invalidación**, firmarlo, transmitirlo y almacenar su propio sello |

### 5.4 SRS-REQ-DTE-006 — Lotes en contingencia (Prioridad Alta)

| ID | Requerimiento | Implementación |
|---|---|---|
| RF-LOT-01 | Monitorear conectividad con el MH | Worker con *ping* periódico (cada 60 s configurable, `CONTINGENCY_POLL_SECONDS`). Se muestra en la barra superior y en la bandeja |
| RF-LOT-02 | Agrupar los DTE en un único payload | Construir el **JSON de lote** y mostrarlo/descargarlo |
| RF-LOT-03 | Actualizar el estado individual de cada DTE | Procesar la respuesta del lote documento por documento: `PROCESADO` o `RECHAZADO` según corresponda |
| RNF-LOT-01 | Segundo plano, sin bloquear la caja | Worker independiente del request del POS; el POS nunca espera al lote |
| RNF-LOT-02 | Límite de documentos por lote | `BATCH_MAX_DOCUMENTS` (ZG-08); si la cola lo supera, se parte en varios lotes |
| Criterio de éxito | Sin intervención manual al volver la red | Al restablecerse la conexión, el worker transmite **automáticamente** en su siguiente ciclo. Existe además el botón "Transmitir lote ahora" (Administrador) para acelerar la demostración |

### 5.5 SRS-REQ-INV-003 — Catálogo de productos (Prioridad Media)

| ID | Requerimiento | Implementación |
|---|---|---|
| RF-CAT-01 | Crear, leer, actualizar y deshabilitar productos | CRUD completo; "deshabilitar" es borrado lógico (`active=false`); un producto deshabilitado no aparece en el POS |
| RF-CAT-02 | Entradas asociadas a un proveedor | Tabla `proveedor`, tabla `lote_ingreso` con proveedor y número de factura del proveedor |
| RF-CAT-03 | Costo promedio ponderado dinámico | Recalculado en el servidor tras cada ingreso y previsualizado en la UI antes de confirmar. Fórmula: `(stock_actual × costo_actual + cant × costo_lote) / (stock_actual + cant)` |
| RNF-CAT-01 | Paginación | Paginación real en servidor (25 por página), con búsqueda y filtros |
| RNF-CAT-02 | SKU con índice único | `UNIQUE INDEX` en `producto.sku` y validación con mensaje claro en el panel de alta |

### 5.6 SRS-REQ-VTA-002 — Directorio de clientes (Prioridad Baja-Media)

| ID | Requerimiento | Implementación |
|---|---|---|
| RF-CLI-01 | Buscar por nombre, NIT, NRC o DUI | Búsqueda indexada con coincidencia parcial; normaliza guiones y espacios |
| RF-CLI-02 | Guardar automáticamente clientes nuevos al emitirles su primer DTE | Alta rápida en el POS ("Guardar y usar en esta venta"), y si un DTE se emite a un receptor no registrado, se crea el perfil al confirmar |
| RF-CLI-03 | Autocompletar los campos de facturación | Seleccionar un cliente puebla el bloque de receptor y recalcula retención y tipo de documento |
| RNF-CLI-01 | Búsqueda rápida | Debounce corto, resultados paginados; endpoint con índice. Meta: respuesta local < 200 ms |
| RNF-CLI-02 | Selección con atajos de teclado | `F4` abre el selector; flechas arriba/abajo y `Enter` seleccionan; `Esc` cierra |

### 5.7 SRS-REQ-VTA-003 — Corte Z (Prioridad Media)

| ID | Requerimiento | Implementación |
|---|---|---|
| RF-CAJ-01 | Sumarizar ingresos por método de pago | Calculado desde las ventas reales del turno (Efectivo, Tarjeta, Transferencia) |
| RF-CAJ-02 | Contabilizar DTE por tipo | Conteo real por tipo (01, 03, 05), invalidados y pendientes en contingencia |
| RF-CAJ-03 | Bloquear la terminal tras el corte | Estado de caja `CERRADA`; el backend rechaza ventas hasta nueva apertura |
| RNF-CAJ-01 | Formato de impresión térmica | Documento de 80 mm de ancho, monoespaciado, renderizado como vista previa y exportable a PDF |
| RNF-CAJ-02 | No bloquear otras cajas | El modelo soporta múltiples terminales (`caja.id`); el corte solo afecta a la caja del cajero. Sembrar una segunda caja inactiva para probar que no se ve afectada |
| Lógica | Excluir transacciones anuladas | Las ventas `INVALIDADO` se excluyen de los totales y se cuentan aparte |

### 5.8 SRS-REQ-SEG-002 — Autenticación y RBAC (Prioridad Alta)

| ID | Requerimiento | Implementación |
|---|---|---|
| RF-SEG-01 | Perfiles Cajero y Administrador | Tabla `usuario` con rol; módulo "Usuarios y roles" (alta, edición, desbloqueo) |
| RF-SEG-02 | Ocultar elementos de UI según el rol | Rail, acciones y rutas filtrados por rol; acceso directo por URL muestra "Acceso denegado" |
| RF-SEG-03 | Cierre de sesión al expirar el token | JWT con expiración corta configurable; al expirar se muestra el overlay "Sesión expirada" y se fuerza el reingreso. Botón en el panel de simulación: "Expirar sesión ahora" |
| RNF-SEG-01 | Validación de roles obligatoriamente en backend | Middleware que verifica JWT y rol en **cada** ruta protegida; pruebas que llaman a las rutas sin UI y esperan `401`/`403` |
| RNF-SEG-02 | Credenciales y llaves privadas cifradas | Contraseñas con argon2 o bcrypt; llave privada del certificado de pruebas cifrada en reposo (AES-256-GCM con secreto de `.env`) |

---

## 6. REQUERIMIENTOS PROPUESTOS PARA EL PROTOTIPO (NO SON FORMALES)

Estos requerimientos cubren huecos (ZG-02 a ZG-05, ZG-09) y la funcionalidad de simulación. Se numeran `PRT-` para distinguirlos de los formales. **En el README y en la UI de demostración deben presentarse como propuestos.**

### 6.1 Punto de venta (ZG-03)

| ID | Requerimiento |
|---|---|
| PRT-POS-01 | Búsqueda de producto por SKU, nombre o código de barras (campo con foco y tecla `F2`). Un lector de código de barras que "teclea" el SKU + `Enter` agrega la línea |
| PRT-POS-02 | Carrito con líneas editables (cantidad +/−, eliminar), importes y totales recalculados en vivo |
| PRT-POS-03 | Verificación de stock por línea con alerta y bloqueo (regla 4) |
| PRT-POS-04 | Bloque de receptor con "Cambiar" (`F4`); por defecto Consumidor final |
| PRT-POS-05 | El tipo de documento se deriva del receptor: contribuyente → CCFE (03); consumidor final → FCFE (01); modificable en el cobro cuando aplica |
| PRT-POS-06 | Cobro (`F9`) con método de pago (Efectivo, Tarjeta, Transferencia), efectivo recibido y vuelto |
| PRT-POS-07 | Descuento de stock **al confirmar** la venta, de forma atómica con la creación del DTE (transacción de base de datos) |
| PRT-POS-08 | Productos de tipo servicio (p. ej. Mantenimiento preventivo) no descuentan stock |
| PRT-POS-09 | El carrito persiste ante la apertura y cierre de modales (y ante recarga, en almacenamiento local, por terminal) |
| PRT-POS-10 | Apertura de caja con fondo inicial, que habilita la terminal; sin turno abierto el POS está inactivo |
| PRT-POS-11 | Anular una venta no confirmada (limpiar carrito) pide confirmación |

### 6.2 FCFE y tipos de documento (ZG-02)

| ID | Requerimiento |
|---|---|
| PRT-DTE-01 | Emitir FCFE (`01`) con el mismo pipeline que CCFE, sin datos de contribuyente y sin retención |
| PRT-DTE-02 | Los tres tipos del MVP: `01` FCFE, `03` CCFE, `05` NCE, más el **evento de invalidación** (no es un DTE de venta pero sí un documento sellado) |
| PRT-DTE-03 | Numeración secuencial de `numeroControl` por tipo con el formato `DTE-<tipo>-M001P001-<15 dígitos>` |
| PRT-DTE-04 | `codigoGeneracion` UUID v4 en mayúsculas, único |

### 6.3 Administración y soporte (ZG-04, ZG-05)

| ID | Requerimiento |
|---|---|
| PRT-ADM-01 | Resumen del Administrador: ventas del día, DTE por tipo, pendientes en contingencia, productos bajo stock; cada tarjeta navega a su pantalla. **Primero en recortarse** |
| PRT-ADM-02 | Alertas de stock bajo: umbral `stock_minimo` por producto y estados Activo / Bajo stock / Sin stock |
| PRT-ADM-03 | (P2, opcional) Kardex por producto, con todos los movimientos de inventario (ZG-05) |
| PRT-ADM-04 | Directorio y ficha de cliente con resumen (documentos emitidos, acumulado del año, último documento) e historial de DTE |
| PRT-ADM-05 | Módulo Usuarios y roles: alta, edición, asignación de rol, desbloqueo de cuentas |

### 6.4 Seguridad de acceso (ZG-09)

| ID | Requerimiento |
|---|---|
| PRT-SEG-01 | Login con correo y contraseña; error *"Credenciales incorrectas. La cuenta se bloquea tras 3 intentos fallidos."* |
| PRT-SEG-02 | Bloqueo de la cuenta tras 3 intentos fallidos consecutivos; el Administrador la desbloquea |
| PRT-SEG-03 | **El login real es una pantalla y el selector de rol es otra.** El selector está visiblemente rotulado como "Herramienta de demostración" y solo existe si `DEMO_MODE=true`. Cada tarjeta lista los módulos que ve el rol. Nunca mezclarlos: el control de acceso por rol es lo que se demuestra |
| PRT-SEG-04 | Menú de usuario (idéntico en ambos roles): Mi perfil · Cambiar de rol (solo demo) · Cerrar sesión · y, para el Cajero con turno abierto, Cerrar turno |
| PRT-SEG-05 | Bitácora de auditoría de inicios de sesión, bloqueos y acciones sensibles |

### 6.5 Simulación del MH y del entorno (núcleo del prototipo funcional)

| ID | Requerimiento |
|---|---|
| PRT-SIM-01 | **Simulador del MH** como servicio HTTP separado del API de negocio (`/mh-sim/*`), con su propio proceso o su propio *router* y su propio estado. El backend de negocio lo trata como un servicio externo |
| PRT-SIM-02 | **Interruptor "Simular caída de conexión MH"** en la barra superior, visible para ambos roles, rotulado como herramienta de demostración. Afecta a **todas** las pantallas a la vez (estado en servidor, notificado por SSE o *polling*) |
| PRT-SIM-03 | **Panel de simulación** (acceso desde un icono discreto de la barra): modo de conexión (En línea / Sin conexión / Lenta, con latencia configurable), "Rechazar el próximo documento" (con selección de código de error), "Expirar sesión ahora", "Cargar ventas de demostración del turno", "Restablecer datos de demostración" |
| PRT-SIM-04 | **Consola del MH** (panel lateral o pantalla de Administrador): lista cronológica de cada intercambio con el simulador (petición, JSON enviado, JWS, respuesta, sello, latencia), para que el público vea qué ocurre detrás. Cada fila abre el detalle |
| PRT-SIM-05 | El simulador valida realmente: firma JWS verificable contra el certificado de pruebas, estructura del JSON contra el esquema, duplicado de `codigoGeneracion`, NRC en el padrón, que la NCE referencie un DTE sellado, y los plazos de la invalidación. Si algo falla, devuelve un rechazo con código y campo señalado |
| PRT-SIM-06 | Generar el `selloRecepcion` y una marca de tiempo de procesamiento del MH en cada documento aceptado |
| PRT-SIM-07 | Modo lote: el simulador acepta un arreglo de documentos y responde por documento (algunos pueden rechazarse) |
| PRT-SIM-08 | Todos los parámetros y supuestos del simulador se describen en una pantalla "Acerca de la simulación", para que quede claro qué es real y qué no |

---

## 7. DOCUMENTOS QUE EL SISTEMA DEBE GENERAR Y MOSTRAR DENTRO DE LA APLICACIÓN

**Principio:** todo documento que menciona esta especificación debe existir como artefacto generado por el sistema, ser visible dentro de la app (no solo descargable) y estar vinculado a su DTE.

| Documento | Cuándo se genera | Dónde se ve | Formatos |
|---|---|---|---|
| **JSON del DTE** (CCFE/FCFE/NCE) | Al construir el DTE | Pestaña "JSON" del detalle de DTE, con visor formateado y copiar | JSON |
| **JSON firmado (JWS)** | Al firmar | Pestaña "Firma" del detalle (encabezado, carga útil y firma decodificados) | JWS compacto |
| **Representación gráfica del DTE (PDF)** | Al quedar `PROCESADO` o, en contingencia, como versión provisional | Visor embebido en el detalle y en "Venta confirmada" | PDF |
| **Ticket de venta** | Al confirmar | Superposición de vista previa térmica (80 mm) | HTML imprimible + PDF |
| **Comprobante provisional de contingencia** | Al encolar | Vista previa, con la leyenda "Documento en contingencia — pendiente de sello" | HTML imprimible + PDF |
| **Banda de sello** | En cada DTE | Elemento firma de la UI (ver sección 12): `numeroControl`, `codigoGeneracion`, `selloRecepcion` | — |
| **Evento de invalidación** (JSON, firmado, sellado) | Al invalidar | Pestaña "Eventos" del detalle y consola del MH | JSON / JWS |
| **JSON de lote de contingencia** | Al transmitir el lote | Detalle del lote en la bandeja de contingencia | JSON |
| **Respuesta del MH por documento** | Al procesar | Consola del MH y detalle del DTE (código, descripción, observaciones) | JSON |
| **NCE** | Al emitir la devolución | Detalle de la NCE, vinculada al DTE original por `codigoGeneracion` | JSON + PDF |
| **Corte Z** | Al cerrar turno | Pantalla de Corte Z con vista previa térmica `CORTE Z #NNNN` y exportación | HTML térmico + PDF |
| **Comprobante de ingreso de lote** | Al confirmar un ingreso | Detalle en el movimiento de inventario | PDF/HTML |
| **Bandeja de salida de correo** | Al "Enviar por correo" | Pantalla "Correos enviados (simulado)" con el mensaje y el PDF y JSON adjuntos | — |
| **Bitácora del DTE** | En cada transición | Línea de tiempo del detalle con marca de tiempo (Generado · Firmado · Transmitido · Sellado) | — |
| **Registro de auditoría** | En acciones sensibles | Pantalla de auditoría (Administrador) | — |

Generación de PDF: `pdfkit` o equivalente en el servidor; **sin dependencias de servicios externos**. Los PDF deben abrirse sin errores y mostrar los mismos datos que la pantalla.

---

## 8. MODELO DE DATOS (MÍNIMO)

**Motor: PostgreSQL 16+** (ZG-01 resuelta). Convenciones: claves primarias `uuid` (`gen_random_uuid()`) salvo las secuencias de numeración, que usan `SEQUENCE` o una tabla de contadores bloqueada con `SELECT ... FOR UPDATE` para evitar huecos y duplicados bajo concurrencia; montos en `NUMERIC(12,2)` (RNF-CCFE-02) y cantidades de stock en `INTEGER`; marcas de tiempo en `TIMESTAMPTZ` con zona de presentación `America/El_Salvador`; `CHECK` para estados y roles (o tipos `ENUM`); inmutabilidad de `dte_event` y `audit_log` reforzada con **triggers que rechazan UPDATE y DELETE**; la transmisión de lotes toma documentos con `FOR UPDATE SKIP LOCKED` para que dos ciclos del worker no envíen el mismo DTE. Usa un cliente SQL con migraciones explícitas (Drizzle, Kysely o `node-pg-migrate`; elige uno y regístralo en `docs/DECISIONES.md`).

Tablas principales (nombres orientativos; ajusta con criterio):

- `usuario` (id, nombre, correo, password_hash, rol, activo, intentos_fallidos, bloqueado_hasta)
- `caja` (id, nombre, establecimiento, punto_venta)
- `turno_caja` (id, caja_id, cajero_id, apertura_at, cierre_at, fondo_inicial, efectivo_contado, estado)
- `cliente` (id, nit, nrc, dui, razon_social, nombre_comercial, giro, tipo_contribuyente, departamento, municipio, direccion, telefono, correo, activo)
- `padron_nrc` (nrc, razon_social, activo) — simula el padrón del MH
- `proveedor` (id, nombre, nit)
- `producto` (id, sku UNIQUE, nombre, categoria, tipo [bien|servicio], costo_promedio, precio, stock, stock_minimo, activo)
- `lote_ingreso` (id, proveedor_id, producto_id, cantidad, costo_unitario, factura_proveedor, fecha_recepcion, usuario_id)
- `movimiento_inventario` (id, producto_id, tipo [INGRESO|VENTA|DEVOLUCION|REVERSION_INVALIDACION|AJUSTE], cantidad, costo, referencia_dte_id, referencia_lote_id, saldo_resultante, created_at)
- `venta` (id, turno_id, cliente_id, metodo_pago, efectivo_recibido, vuelto, created_at)
- `dte` (id, tipo, numero_control UNIQUE, codigo_generacion UNIQUE, estado, venta_id, cliente_id, referenced_dte_id [FK inmutable], json_original, jws, sello_recepcion, gravado, iva, retencion, total, emitido_at, procesado_at, intentos_transmision)
- `dte_linea` (id, dte_id, producto_id, descripcion, cantidad, precio_unitario, gravado)
- `dte_event` (id, dte_id, estado_origen, estado_destino, actor, motivo, payload, created_at) — **solo inserción**
- `evento_invalidacion` (id, dte_id, motivo_id, responsable_id, observaciones, json, jws, sello, created_at)
- `motivo_invalidacion` (id, descripcion)
- `lote_contingencia` (id, created_at, estado, documentos, respuesta)
- `mh_exchange` (id, direccion, endpoint, request, response, latencia_ms, created_at) — alimenta la consola del MH
- `correo_simulado` (id, destinatario, asunto, cuerpo, adjuntos, created_at)
- `audit_log` (id, usuario_id, accion, entidad, entidad_id, detalle, created_at) — **solo inserción**
- `config` (clave, valor) — parámetros de ZG-06, ZG-07, ZG-08 y modo de conexión del MH

**Todas las operaciones que involucren más de una tabla (venta + DTE + stock + eventos) corren en una transacción.**

---

## 9. API (BACKEND DE NEGOCIO)

Prefijo `/api`. Todas las rutas protegidas exigen `Authorization: Bearer <JWT>` y verifican rol en el servidor.

| Área | Rutas (orientativas) | Roles |
|---|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/demo-role` (solo `DEMO_MODE`) | público / autenticado |
| Caja | `POST /caja/abrir`, `GET /caja/estado`, `GET /caja/corte-z/preview`, `POST /caja/corte-z/confirmar` | Cajero (Admin lectura) |
| Catálogo | `GET/POST/PUT /productos`, `PATCH /productos/:id/estado`, `POST /lotes`, `GET /productos/:id/movimientos` | Admin (el POS usa `GET /productos/buscar` para ambos roles) |
| Clientes | `GET /clientes` (búsqueda), `GET /clientes/:id`, `POST /clientes`, `PUT /clientes/:id` | Cajero: lectura y alta; Admin: todo |
| Padrón | `GET /padron/nrc/:nrc` | autenticado |
| Ventas / DTE | `POST /ventas` (emite el DTE), `GET /dte`, `GET /dte/:id`, `GET /dte/:id/json`, `GET /dte/:id/pdf`, `POST /dte/:id/invalidar`, `POST /dte/nce`, `POST /dte/:id/enviar-correo` | Cajero: emitir y leer; Admin: invalidar y NCE |
| Contingencia | `GET /contingencia`, `POST /contingencia/probar-conexion`, `POST /contingencia/transmitir` | Cajero: lectura; Admin: acciones |
| Usuarios | `GET/POST/PUT /usuarios`, `POST /usuarios/:id/desbloquear` | Admin |
| Resumen | `GET /resumen` | Admin |
| Simulación | `GET/POST /sim/estado`, `POST /sim/rechazar-proximo`, `POST /sim/expirar-sesion`, `POST /sim/cargar-ventas`, `POST /sim/reset`, `GET /sim/consola` | autenticado (solo `DEMO_MODE`) |
| Tiempo real | `GET /events` (SSE): cambios de modo de conexión, contador de cola, estados de DTE | autenticado |
| Simulador MH | `/mh-sim/auth`, `/mh-sim/recepcion`, `/mh-sim/recepcionlote`, `/mh-sim/anulardte`, `/mh-sim/health` | servicio interno |

Errores con formato uniforme `{ code, message, field? }`. Códigos HTTP correctos (`401`, `403`, `409`, `422`).

---

## 10. FRONTEND — PANTALLAS Y NAVEGACIÓN

**Stack:** React + TypeScript + Vite + Tailwind. Enrutado con React Router. Estado de servidor con TanStack Query. Formularios con validación (react-hook-form + zod). Todos los componentes reutilizables viven en `web/src/components`.

### 10.1 Reglas globales de navegación

1. **Rail lateral (240 px).** Cada ítem navega a su pantalla real. El ítem activo va en `sello-600` con texto blanco; el resto en `pizarra-400` sobre `tinta-900`.
   - **Cajero (4):** Punto de venta · Historial de DTE · Clientes · Contingencia.
   - **Administrador (7):** Resumen · Punto de venta · Catálogo · Clientes · Historial de DTE · Contingencia · Usuarios y roles.
   - El rail del Cajero **no contiene** Catálogo, Resumen ni Usuarios. Eso es control de acceso por rol, no un descuido.
2. **Bloque de usuario** (inferior izquierdo, idéntico en ambos roles): menú hacia arriba con Mi perfil · Cambiar de rol (solo demo) · Cerrar sesión (y Cerrar turno para el Cajero con turno abierto).
3. **Barra superior (64 px)** siempre con: estado de Caja (abierta/cerrada + cajero), estado de Conexión MH (`MH EN LÍNEA` verde / `MH SIN CONEXIÓN` ámbar) con contador de DTE pendientes, reloj, interruptor de caída de conexión y acceso al panel de simulación.
4. **Modales y paneles:** se cierran con X, Cancelar, `Esc` o clic en el fondo, y siempre vuelven a la pantalla que los abrió **sin perder el estado** (un carrito con tres líneas sigue con tres líneas).
5. **Terminal bloqueada** (turno cerrado): el rail queda inactivo y cualquier ruta operativa redirige a "Caja cerrada".
6. **Acceso a una ruta no permitida** (por clic o por URL): pantalla "Acceso denegado" con botón "Volver al inicio" (POS si es Cajero, Resumen si es Administrador).

### 10.2 Inventario de pantallas

**Autenticación y shell:** Login · Selector de rol (demo) · Sesión expirada · Acceso denegado · Mi perfil.

**Cajero y punto de venta:** Apertura de caja · POS (vacío) · POS (carrito) · POS (alerta de stock) · Modal Buscar cliente · Modal Registrar cliente · Modal Cobro · Procesando DTE (tres pasos reales: generar JSON → firmar JWS → transmitir al MH) · Venta confirmada (banda de sello) · Venta en contingencia · DTE rechazado (corregir y reenviar) · Corte Z · Caja cerrada.

**Compartidas (según rol):** Historial de DTE · Detalle de DTE (pestañas: Resumen, Líneas, JSON, Firma, Eventos, Bitácora) · Directorio de clientes · Ficha de cliente · Bandeja de contingencia · Consola del MH · Correos enviados (simulado).

**Solo Administrador:** Resumen · Catálogo · Alta/edición de producto (panel lateral) · Ingreso de lote (panel lateral con costo promedio en vivo) · Modal Invalidar · Nota de crédito · Usuarios y roles (alta/edición/desbloqueo) · Auditoría · (P2) Kardex.

### 10.3 Mapa de navegación

```
LOGIN
  credenciales correctas → Daniela Reina (Admin): Resumen · José Luis Hernández (Cajero): Apertura de caja
  credenciales incorrectas → permanece, muestra error; 3 fallos → cuenta bloqueada
  "Explorar el prototipo" (solo DEMO_MODE) → Selector de rol
SELECTOR DE ROL (demo) → Cajero → Apertura de caja · Administrador → Resumen · Volver → Login

CAJERO
  Apertura de caja → abrir → POS vacío (chip CAJA 01 ABIERTA)
  POS: F2 buscar · F4 cliente · F9 cobrar (deshabilitado con carrito vacío)
    +1 sobre el stock → alerta, sin agregar
    Receptor Gran Contribuyente + gravado > $100 → aparece Retención 1%
    Receptor Consumidor final → documento pasa a FCFE, sin retención
  Cobro → Confirmar y emitir → Procesando DTE → (MH en línea) Venta confirmada | (MH caído) Venta en contingencia | (MH rechaza) DTE rechazado
  Venta confirmada/contingencia → Nueva venta (F9) · Imprimir ticket/provisional · Descargar PDF/JSON · Enviar por correo
  Historial / Clientes / Contingencia: solo lectura, sin Invalidar ni NCE ni Transmitir lote
  Cerrar turno → Corte Z → Confirmar → Caja cerrada → Abrir nuevo turno → Apertura de caja

ADMINISTRADOR
  Resumen → tarjetas navegan a Historial / Contingencia / Catálogo (stock bajo)
  Catálogo → Nuevo producto · fila → edición · Registrar ingreso de lote
  Clientes → Nuevo cliente · fila → Ficha → Editar · Nuevo documento (abre el POS con ese cliente) · fila de historial → Detalle de DTE
  Historial → fila → Detalle de DTE → Descargar · Emitir NCE · Invalidar (deshabilitados si ya está INVALIDADO o fuera de plazo)
  Contingencia → Probar conexión · Transmitir lote ahora · fila → Detalle de DTE
  Usuarios y roles → Nuevo usuario · fila → edición · Desbloquear
```

### 10.4 Persistencia de estado a lo largo de la navegación

Estos siete puntos son justamente lo que se demuestra y deben tener pruebas end-to-end:

1. El carrito sobrevive a abrir y cerrar modales.
2. El interruptor de conexión del MH afecta a todas las pantallas a la vez.
3. El contador de DTE en cola sube con cada venta en contingencia y vuelve a cero al transmitir.
4. El Corte Z bloquea la terminal y el POS no vuelve a operar hasta una nueva apertura.
5. Cambiar de rol cambia el rail completo y las acciones disponibles en las pantallas compartidas.
6. Invalidar deja el documento `INVALIDADO` también en el historial.
7. El tipo de contribuyente del receptor decide si aparece la retención.

---

## 11. LOS OCHO FLUJOS DE DEMOSTRACIÓN (CRITERIOS DE ACEPTACIÓN END-TO-END)

Cada flujo debe tener una prueba end-to-end automatizada (Playwright) y un guion en `docs/DEMO.md`.

| Flujo | Recorrido | Debe verificarse |
|---|---|---|
| **F1 Acceso y roles** | Login → Apertura de caja (Cajero) / Resumen (Admin) | Bloqueo tras 3 intentos; el Admin lo desbloquea; rail reducido del Cajero; expiración de sesión |
| **F2 Venta completa** | Apertura → POS → cliente → cobro → procesando → confirmada | El ejemplo canónico da `$647.36`; stock descontado; DTE `PROCESADO` con sello; PDF, JSON y ticket visibles |
| **F3 Contingencia** ⭐ | POS → cobro → MH caído → encolada → bandeja → restablecer → transmisión | La venta no bloquea la caja; varias ventas seguidas se encolan; el contador sube; al restablecer la conexión el worker transmite solo; todos quedan `PROCESADO` con sello; contador en 0; chips y rail vuelven a su estado. Se puede lograr también con "Transmitir lote ahora" |
| **F4 Cierre de turno** | POS → Corte Z → caja bloqueada | Totales derivados de las ventas reales; diferencia de efectivo con el conteo ingresado; ticket térmico; las ventas anuladas se excluyen; el POS queda inaccesible (UI **y** API) |
| **F5 Inventario** | Catálogo → nuevo producto → ingreso de lote | SKU duplicado rechazado; costo promedio ponderado previsualizado y luego persistido (ejemplo: 18 u a $148.00 + 10 u a $162.00 → 28 u a **$153.00**); movimiento registrado |
| **F6 Invalidación** | Historial → detalle → invalidar | Motivo del catálogo; stock revertido; estado `INVALIDADO` en detalle e historial; evento firmado y sellado; bitácora; DTE fuera de plazo bloqueado; el Cajero no ve la acción y el API le responde `403` |
| **F7 Devolución** | Historial → detalle → NCE | Referencia al `codigoGeneracion`; monto parcial calculado; tope respetado; stock reintegrado; NCE (`05`) sellada; con MH caído la NCE se encola |
| **F8 Acceso denegado** | Login Cajero → rail reducido → URL de Catálogo | Pantalla "Acceso denegado" **y** `403` del API |

---

## 12. DISEÑO

**Dirección.** Herramienta de mostrador que un cajero usa ocho horas al día, con teclado y lector de código de barras. La estética se ancla en el documento fiscal: papel de ticket, tinta y el sello de recepción como objeto central. **No es un dashboard SaaS.** Denso y sobrio; solo la banda de sello es decorativa.

**Elemento firma — banda de sello.** Bloque monoespaciado con borde punteado tipo ticket que muestra `numeroControl`, `codigoGeneracion` y `selloRecepcion`. Aparece en el detalle de DTE y en Venta confirmada. En contingencia es ámbar y el sello dice *"Pendiente · se asignará al transmitir el lote"*.

### Tokens (úsalos exactamente; defínelos en `tailwind.config` y como variables CSS)

| Token | Hex | Uso |
|---|---|---|
| `tinta-900` | `#101C18` | Texto principal, rail |
| `tinta-600` | `#3D4B45` | Texto secundario |
| `pizarra-400` | `#7C8A83` | Texto terciario, placeholders |
| `papel-50` | `#F6F7F4` | Fondo de aplicación |
| `superficie` | `#FFFFFF` | Tarjetas, tablas, modales |
| `borde` | `#DFE3DD` | Divisores, bordes de input |
| `sello-600` | `#0D6B57` | Acción primaria, `PROCESADO` |
| `sello-100` | `#D7EDE6` | Fondo de chips de éxito |
| `ambar-600` | `#A86A00` | `ENCOLADO`, contingencia, advertencias |
| `ambar-100` | `#F7EBD2` | Fondo de chips de contingencia |
| `granate-600` | `#9B2C36` | `INVALIDADO`, `RECHAZADO`, acciones destructivas |
| `granate-100` | `#F6DEE0` | Fondo de chips de error |

**Tipografía:** IBM Plex Sans (interfaz), IBM Plex Mono (montos, SKU, NIT/NRC, UUID, número de control y sello; cifras tabulares, alineadas a la derecha), IBM Plex Sans Condensed SemiBold (títulos de sección). Escala 12 / 14 / 16 / 20 / 24 / 32 / 44. El **total de la venta va a 44 px y es el único número grande** de la aplicación. Cárgalas localmente (paquetes `@fontsource`), sin CDN.

**Layout:** escritorio 1440×900; espaciado base 8 px; radio 6 px en controles y 10 px en tarjetas; sombras solo en overlays; objetivos táctiles mínimos de 44 px en el POS. El POS rompe el shell: panel izquierdo fluido (buscador + carrito) y derecho fijo de 400 px (receptor, totales, botón de cobro). Pistas visibles de atajos: `F2`, `F4`, `F9`.

**Seis chips de estado** (más `BORRADOR`/`FIRMADO`/`TRANSMITIDO`): un único componente `<EstadoDte />` usado en todas las pantallas.

**Accesibilidad:** foco visible, contraste AA, navegación completa por teclado en el POS.

> Si existe `docs/design-reference/` (exportación del prototipo de Claude Design), úsala como referencia visual de cada pantalla. La maqueta acordada con la catedrática, si el usuario la aporta, manda sobre esta sección (ZG-14).

---

## 13. DATOS SEMILLA

El script `npm run seed` crea el estado de demostración y se puede ejecutar de nuevo (`POST /sim/reset`). **Las fechas se generan relativas al momento de ejecución** (para que existan DTE "de hoy" invalidables y otros fuera de plazo). **Los totales de los DTE semilla se calculan con el motor real; no los escribas a mano.** Los importes del ejemplo canónico sí deben coincidir exactamente.

**Empresa emisora:** Ciclo Andes, S.A. de C.V. (ver sección 1).

**Usuarios (credenciales de prueba, solo para demostración):**
- Daniela Reina — `daniela.reina@cicloandes.test` — Administrador — `Demo2026!`
- José Luis Hernández — `jose.hernandez@cicloandes.test` — Cajero, Caja 01 — `Demo2026!`
- Un tercer usuario Cajero de prueba para el flujo de bloqueo.

**Clientes:**

| Razón social | NIT | NRC | Giro | Tipo |
|---|---|---|---|---|
| Rutas del Pacífico, S.A. de C.V. | 0614-030417-103-8 | 189234-5 | Servicios de turismo de aventura | Gran Contribuyente |
| Taller Bici Norte | 0614-221199-101-2 | 302118-7 | Reparación de bicicletas | Normal |
| Ciclismo Escolar Los Planes | 0614-140820-105-1 | 418902-3 | Enseñanza deportiva | Normal |
| Distribuidora Pedal Sur | 0614-090316-108-4 | 205673-1 | Comercio al por mayor | Gran Contribuyente |
| Bici Tours El Boquerón | 0614-271121-102-9 | 390455-6 | Turismo local | Normal (inactivo) |
| Consumidor final | DUI 04521987-3 | — | — | — |

Completar con 80 clientes generados adicionales (hasta ~87) para que la paginación y la búsqueda tengan sentido. Padrón de NRC: todos los NRC válidos más al menos **uno inexistente** documentado para demostrar el bloqueo (p. ej. `999999-9`).

**Catálogo** (precios netos; ~214 productos: estos 9 y el resto generados con SKU únicos y coherentes con el giro):

| SKU | Producto | Categoría | Costo prom. | Precio | Stock |
|---|---|---|---|---|---|
| BIC-MTB-0290 | Bicicleta MTB Trailhawk 29" talla M | Bicicletas | $268.00 | $415.00 | 12 |
| BIC-RUT-0700 | Bicicleta de ruta Velodry 700c talla 54 | Bicicletas | $392.00 | $610.00 | 4 |
| BIC-URB-0260 | Bicicleta urbana Sendero 26" | Bicicletas | $148.00 | $235.00 | 18 |
| CAS-URB-0114 | Casco urbano Orbea talla L | Accesorios | $22.50 | $38.00 | 26 |
| LUZ-LED-0055 | Juego de luces LED recargables | Accesorios | $9.40 | $16.00 | 24 |
| CAD-9V-0210 | Cadena 9 velocidades KMC | Repuestos | $11.20 | $19.50 | 7 |
| CAM-MTB-0029 | Cámara 29" válvula Presta | Repuestos | $2.80 | $5.50 | 140 |
| POR-ALU-0032 | Portabultos trasero de aluminio | Accesorios | $14.00 | $26.00 | 0 |
| SER-MAN-0001 | Mantenimiento preventivo | Servicios | — | $25.00 | — (servicio) |

Proveedor semilla: Importadora Ciclos del Istmo.

**Venta canónica (debe reproducirse exacta):** 2 × Bicicleta urbana Sendero 26" ($470.00) + 2 × Casco urbano Orbea talla L ($76.00) + 2 × Juego de luces LED ($32.00) → gravado **$578.00**, IVA **$75.14**, retención **−$5.78**, total **$647.36**, receptor Rutas del Pacífico (Gran Contribuyente), CCFE tipo 03.

**DTE semilla:** una docena de documentos de los últimos días con mezcla de tipos (01, 03, 05) y de estados: varios `PROCESADO`, uno `INVALIDADO`, uno `RECHAZADO`, uno `PROCESADO` **fuera del plazo de invalidación**, y uno `PROCESADO` emitido hoy (invalidable). Todos con `numeroControl`, `codigoGeneracion` y sello coherentes, y con sus movimientos de inventario.

**Formato de identificadores:**
- `numeroControl`: `DTE-03-M001P001-000000000000247` (tipo, establecimiento+punto de venta, secuencia de 15 dígitos).
- `codigoGeneracion`: UUID v4 en mayúsculas, p. ej. `A1F3C8D2-5B47-4E19-9C06-3D82F1E70B45`.
- `selloRecepcion`: cadena alfanumérica en mayúsculas generada por el simulador del MH.

---

## 14. PLAN DE ENTREGAS (UN PR POR ENTREGA)

Cada entrega termina con `npm run verify` en verde, un PR con la plantilla de 0.4 y los commits atómicos descritos en 0.3. El orden prioriza lo demostrable y deja lo recortable al final.

| # | Rama | Contenido | Requerimientos |
|---|---|---|---|
| 00 | `chore/scaffold` | Monorepo (`web/`, `server/`, `mh-sim/`, `docs/`), TypeScript, ESLint, Prettier, Vitest, Playwright, `docker-compose.yml` con PostgreSQL 16 (volumen persistente, *healthcheck*, base de pruebas separada), CI en GitHub Actions con servicio PostgreSQL, scripts `db:up`, `db:migrate`, `dev`, `seed`, `verify`, `e2e`, README inicial, plantilla de PR | — |
| 01 | `feat/design-system` | Tokens, fuentes locales, botón (4 variantes), input con error, fila de tabla, tarjeta, modal, toast, `EstadoDte`, **banda de sello**, página `/dev/componentes` | Sección 12 |
| 02 | `feat/domain-core` | Dinero en centavos, motor tributario, redondeo, costo promedio ponderado, máquina de estados, numeración. **Puro, sin I/O, con pruebas exhaustivas** (incluye el ejemplo canónico y los límites de $100.00) | RF-CCFE-01/02, RF-CAT-03, RNF-CCFE-02, regla 11 |
| 03 | `feat/server-auth-rbac` | Esquema PostgreSQL y migraciones, triggers de inmutabilidad, semilla de usuarios, login JWT, bloqueo tras 3 intentos, middleware RBAC, auditoría, pruebas de 401/403 | RF-SEG-01/03, RNF-SEG-01/02, PRT-SEG-01/02/05 |
| 04 | `feat/shell-and-auth-ui` | Login, selector de rol (demo), shell con rail por rol, menú de usuario, barra superior, Acceso denegado, Sesión expirada, rutas protegidas | RF-SEG-02, PRT-SEG-03/04, F1, F8 |
| 05 | `feat/catalog-inventory` | CRUD de productos, SKU único, paginación, proveedores, ingreso de lote con costo promedio en vivo, movimientos de inventario | RF-CAT-01/02/03, RNF-CAT-01/02, F5 |
| 06 | `feat/clients` | Directorio, ficha, búsqueda indexada, alta con validación de NRC contra el padrón, atajos de teclado | RF-CLI-01/02/03, RNF-CLI-01/02, ZG regla 5 |
| 07 | `feat/mh-simulator` | Servicio `/mh-sim`, validación de firma/esquema/duplicados, modos de conexión, rechazos configurables, modo lote, `mh_exchange`, consola del MH, interruptor y panel de simulación, SSE | PRT-SIM-01…08 |
| 08 | `feat/pos-and-emission` | Apertura de caja, POS completo, cobro, constructores de JSON (FCFE y CCFE), firma JWS con certificado de pruebas, pipeline de emisión, Procesando DTE, Venta confirmada, ticket, PDF, JSON, correo simulado | RF-CCFE-03, RNF-CCFE-01, PRT-POS-01…11, PRT-DTE-01…04, F2 |
| 09 | `feat/contingency` | Estado `ENCOLADO`, worker con *ping* y reintentos, lote, bandeja de contingencia, comprobante provisional, "Transmitir lote ahora", transmisión automática al restablecerse | RF-LOT-01/02/03, RNF-LOT-01/02, F3 |
| 10 | `feat/dte-history-invalidation` | Historial con filtros reales, detalle con pestañas (Resumen/Líneas/JSON/Firma/Eventos/Bitácora), invalidación con plazo, reversión de stock, evento firmado y sellado, DTE rechazado (corregir y reenviar) | RF-INV-01/02/03, RNF-INV-01/02, F6 |
| 11 | `feat/credit-notes` | NCE: búsqueda por UUID, ítems parciales, tope acumulado, reversión de impuestos, reintegro de stock, FK inmutable, encolado en contingencia | RF-NCE-01/02/03, RNF-NCE-01/02, F7 |
| 12 | `feat/cash-close` | Corte Z con datos reales, conteo de efectivo, diferencia, ticket térmico, bloqueo en UI y API, Caja cerrada, segunda caja de control | RF-CAJ-01/02/03, RNF-CAJ-01/02, F4 |
| 13 | `feat/admin-extras` | Usuarios y roles (alta/edición/desbloqueo), auditoría, **Resumen** (recortable), alertas de stock bajo | PRT-ADM-01/02/05 |
| 14 | `test/e2e-and-demo` | Pruebas E2E de F1–F8 y de los siete estados persistentes, `docs/DEMO.md` (guion de demostración paso a paso, con F3 destacado), pantalla "Acerca de la simulación", README completo | Sección 11 |
| 15 | `feat/kardex` *(opcional, P2)* | Kardex por producto | PRT-ADM-03 |

Si el tiempo se acorta, recorta en este orden: 15 → Resumen del PR 13 → pantalla de correos simulados → DTE rechazado corregible. **Nunca recortes** 02, 07, 08, 09 y 10: son el corazón del producto.

---

## 15. ESTRATEGIA DE PRUEBAS

- **Unitarias (Vitest):** motor tributario (límite exacto $100.00 y $100.01, Gran Contribuyente vs. normal, redondeo), costo promedio ponderado, máquina de estados (todas las transiciones permitidas y prohibidas), numeración, tope de NCE, plazo de invalidación.
- **Integración (servidor), contra PostgreSQL real** (base de pruebas aislada, sin mocks de base de datos; cada suite limpia y migra su esquema): triggers de inmutabilidad de `dte_event` y `audit_log` (UPDATE/DELETE deben fallar), unicidad de `numeroControl` y de SKU bajo inserciones concurrentes, `FOR UPDATE SKIP LOCKED` en el worker, rutas con y sin token, 401/403 por rol, transacción atómica venta+DTE+stock, rollback ante fallo, inmutabilidad de `dte_event`, bloqueo de ventas con caja cerrada, cuenta bloqueada tras 3 intentos.
- **Simulador del MH:** firma inválida, JSON inválido, `codigoGeneracion` duplicado, NRC fuera del padrón, NCE sobre un DTE no sellado, lote con rechazos parciales.
- **E2E (Playwright):** los 8 flujos y los 7 estados persistentes de 10.4. F3 debe cubrir: encender la caída, tres ventas encoladas, contador en 3, restablecer, transmisión automática, contador en 0.
- **Calidad:** `npm run verify` = lint + typecheck + unitarias + integración. `npm run e2e` por separado. La CI ejecuta ambas.
- **Regla:** ninguna regla de negocio de la sección 3 queda sin al menos una prueba que falle si se rompe.

---

## 16. DEFINICIÓN DE "TERMINADO" DEL PROTOTIPO

- [ ] `docker compose up -d db && npm install && npm run db:migrate && npm run seed && npm run dev` levanta el sistema completo (PostgreSQL, web, API y simulador del MH); el README documenta estos pasos y un atajo de un solo comando.
- [ ] Los 8 flujos se recorren de punta a punta sin datos fijos de pantalla: todo viene de la base de datos y del simulador.
- [ ] Cada documento de la sección 7 se genera, se ve dentro de la aplicación y se puede descargar.
- [ ] Todas las reglas de negocio de la sección 3 tienen pruebas en verde.
- [ ] Los 40 requerimientos formales de la sección 5 están implementados o, en los casos que dependen de infraestructura real, declarados como simulados en "Acerca de la simulación".
- [ ] RBAC verificado en el backend (no solo ocultado en UI).
- [ ] `docs/ZONAS-GRISES.md` lista cada supuesto adoptado, con su estado.
- [ ] `docs/DEMO.md` contiene el guion de demostración, con F3 como centro.
- [ ] Cada PR de la sección 14 fue abierto, probado y fusionado con historial limpio.

---

## 17. FUERA DE ALCANCE — NO CONSTRUYAS NI PROPONGAS

Pasarelas de pago online · contabilidad general y libros de IVA · e-commerce público · RRHH y planillas · app móvil nativa · conexión real al Ministerio de Hacienda · emisión real con certificado oficial · integración real con POS bancario o impresora.

---

## 18. NORMAS DE TRABAJO PARA CLAUDE CODE

1. **Léelo todo antes de escribir código**, y consulta este archivo al inicio de cada entrega.
2. **Honestidad ante todo.** Nunca presentes como funcional algo que está simulado, ni como requerimiento formal algo que es propuesta. La UI de demostración y el README deben decir qué es simulado.
3. **No inventes datos normativos.** Plazos legales, límites de lote y esquemas del MH son parámetros configurables y quedan marcados como pendientes de validar (ZG-07, ZG-08, ZG-11).
4. **El motor de base de datos es PostgreSQL** (decisión del equipo, ZG-01). No propongas ni introduzcas otro motor. No uses SQLite ni bases en memoria ni siquiera en las pruebas.
5. **Usa datos y credenciales de prueba únicamente.** Nada real: ni certificados, ni claves, ni NIT reales. Los `.env`, `.p12` y `.pem` no se versionan; `.env.example` sí.
6. **Haz las cosas pequeñas y verificables.** Prefiere muchos commits pequeños a pocos grandes; no mezcles refactor y funcionalidad en el mismo commit.
7. **Si te bloqueas** por una decisión que no es técnica (de negocio o de alcance), regístrala en `docs/ZONAS-GRISES.md`, adopta la opción conservadora y continúa. Pregunta al usuario solo cuando bloquee de verdad el avance.
8. **Al terminar cada entrega** informa con el resumen breve de 0.3 (qué quedó, cómo probarlo, qué decisión quedó pendiente).

**Empieza ahora por la sección 0.**
