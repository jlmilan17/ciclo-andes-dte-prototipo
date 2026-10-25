# Guion de demostración — Ciclo Andes · MVP DTE

Duración sugerida: 20–25 minutos. **F3 (Contingencia) es el centro de la demostración.**

> Todo lo que se ve es real (base de datos, cálculos, firma, máquina de estados, worker), excepto lo declarado como simulado en **Acerca de la simulación** (`/acerca-simulacion`): el Ministerio de Hacienda, el certificado de firma, el padrón de NRC, el POS bancario, la impresora térmica y el correo.

## Preparación (antes de entrar a la sala)

```bash
cp .env.example .env            # solo la primera vez
docker compose up -d db
npm install
npm run db:migrate
npm run seed
npm run dev                     # web http://localhost:5173 · API :4000 · simulador MH :4100
```

- Navegador a 1440 × 900. Abrir `http://localhost:5173/login`.
- Si se ensayó antes: ⚙ (panel de simulación) → **Restablecer datos de demostración**.
- Credenciales (solo de prueba): `daniela.reina@cicloandes.test` (Administrador), `jose.hernandez@cicloandes.test` (Cajero), `marta.lopez@cicloandes.test` (Cajero de prueba). Contraseña: `Demo2026!`.

Datos de referencia sembrados: `DTE-01-…-005` (hoy, invalidable), `DTE-03-…-006` (hace 26 h, fuera de plazo), `DTE-03-…-005` (CCFE de Rutas del Pacífico con una NCE previa), `DTE-03-…-004` (RECHAZADO, corregible). NRC inexistente documentado: `999999-9`.

---

## F1 · Acceso y roles (2 min)

1. Ingresar 3 veces una contraseña incorrecta con `marta.lopez@…` → _"Credenciales incorrectas. La cuenta se bloquea tras 3 intentos fallidos."_ → al tercero, cuenta bloqueada.
2. Entrar como **Daniela (Administrador)** → **Resumen**. Rail de 7 ítems.
3. **Usuarios y roles** → fila de Marta (Bloqueada) → **Desbloquear**.
4. Menú de usuario → **Cambiar de rol** → pantalla separada, rotulada _Herramienta de demostración_ → **Cajero**: rail de 4 ítems (sin Catálogo, Resumen ni Usuarios).
5. ⚙ → **Expirar sesión ahora** → overlay _Sesión expirada_ → reingresar.

## F2 · Venta completa (3 min)

1. Login Cajero → **Apertura de caja** → _Abrir caja_ (chip `CAJA 01 ABIERTA`).
2. POS: escribir `BIC-URB-0260` + Enter (como un lector), `CAS-URB-0114` + Enter, código de barras `7421000550551` + Enter; subir cada línea a 2 con **+**.
3. **F4** → "rutas" → Enter: aparece **Retención 1 %** (Gran Contribuyente y gravado > $100). Total **$647.36**.
4. Mostrar que con _Consumidor final_ el documento pasa a FCFE y desaparece la retención; volver a Rutas.
5. **F9** → Cobro → **F9** → _Procesando DTE_ (generar JSON → firmar JWS → transmitir) → **Venta confirmada** con banda de sello y tiempo de firma y envío (≤ 3 s).
6. _Imprimir ticket_ (80 mm), PDF embebido, _Ver detalle del DTE_ → pestañas **JSON** y **Firma**.

## F3 · Contingencia ⭐ (5 min)

1. En el POS, encender **Simular caída de conexión MH** (barra superior) → chip ámbar `MH SIN CONEXIÓN` en todas las pantallas (cambiar a _Contingencia_ y volver para mostrarlo).
2. Hacer **tres ventas seguidas** (1 producto cada una, F9 → F9 → F9 para la siguiente): cada una termina en **Venta en contingencia**, banda ámbar _"Pendiente · se asignará al transmitir el lote"_, y el contador sube **1 → 2 → 3**. La caja nunca se traba.
3. _Imprimir comprobante provisional_ en una de ellas.
4. Ir a **Contingencia**: 3 documentos `ENCOLADO`.
5. **Apagar el interruptor**. En ~2 s el worker detecta la conexión y transmite el lote **sin intervención manual**: contador **0**, lote _Automático_ con 3 procesados, chip verde.
6. Abrir el lote: **JSON de lote** enviado y **respuesta del MH por documento**. Abrir un DTE → **Bitácora**: Generado · Firmado · En contingencia · Transmitido · Sellado.
7. Variante: como Administrador, **Transmitir lote ahora** acelera el envío. ⚙ → _Consola del MH_ muestra cada intercambio (petición, JWS, respuesta, latencia).

## F4 · Cierre de turno (2 min)

1. Cajero → menú de usuario → **Cerrar turno** → **Corte Z** con totales reales por método, DTE por tipo, invalidados excluidos.
2. Ingresar el efectivo contado → diferencia en vivo → **Confirmar** → **Caja cerrada** (`CORTE Z #NNNN`).
3. El rail queda inactivo; ir a `/pos` → redirige a _Caja cerrada_. El API también rechaza ventas (409).
4. **Abrir nuevo turno** → Apertura.

## F5 · Inventario (2 min)

1. Administrador → **Catálogo** → _Nuevo producto_ con SKU `BIC-URB-0260` → _SKU duplicado_.
2. Fila `BIC-URB-0260` → **Registrar ingreso**: proveedor, 10 u a $162.00 → previsualización **28 u a $153.00** → confirmar → comprobante de ingreso y movimiento en la ficha.

## F6 · Invalidación (2 min)

1. **Historial** → `DTE-03-…-006` → **Invalidar** deshabilitado: _fuera del plazo_ (parámetro provisional de 24 h, PENDIENTE DE VALIDAR, ZG-07).
2. `DTE-01-…-005` (hoy) → **Invalidar** → motivo del catálogo → `INVALIDADO`; pestaña **Eventos** con el evento firmado y su sello; stock revertido.
3. Volver al Historial: el documento figura `INVALIDADO`.
4. Como Cajero, el detalle no muestra la acción (y el API responde 403).

## F7 · Devolución con NCE (2 min)

1. `DTE-03-…-005` → **Emitir NCE** → ya hay 1 casco devuelto: intentar devolver 2 → aviso de tope.
2. Devolver 1 bicicleta + 1 casco → total proporcional **$507.36** → _Emitir_ → NCE (05) sellada, stock reintegrado, vinculada por `codigoGeneracion`.
3. Con el MH caído, una NCE queda en contingencia y se sella con el lote.

## F8 · Acceso denegado (1 min)

1. Login Cajero → escribir `/catalogo` en la URL → **Acceso denegado** con _Volver al inicio_.
2. El API responde `403` a la misma ruta (ver pruebas `npm test -w server` o `npm run e2e`).

---

## Si algo falla en vivo

- ⚙ → **Restablecer datos de demostración** devuelve todo al estado inicial (incluye el modo del MH).
- Si el simulador no responde: verificar que `npm run dev` muestre `[mh]` en ejecución.
- `npm run e2e` reproduce los 8 flujos de forma automática (Playwright).
