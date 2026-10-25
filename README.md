# Ciclo Andes — Prototipo funcional MVP DTE

Prototipo funcional (frontend + backend + simulador del Ministerio de Hacienda) de un sistema de **Punto de Venta, Inventario y Facturación Electrónica (DTE)** para MIPYMES salvadoreñas. Práctica Profesional (UCA).

> **Prototipo de demostración.** El Ministerio de Hacienda, el certificado de firma, el padrón de NRC, las pasarelas de tarjeta, la impresora térmica y el correo son **simulados**. No se conecta a ningún servicio gubernamental real. La pantalla _Acerca de la simulación_ (`/acerca-simulacion`) detalla qué es real y qué no.

- Especificación: [`docs/SPEC.md`](docs/SPEC.md)
- Guion de demostración (F1–F8, con F3 al centro): [`docs/DEMO.md`](docs/DEMO.md)
- Decisiones: [`docs/DECISIONES.md`](docs/DECISIONES.md) · Supuestos provisionales: [`docs/ZONAS-GRISES.md`](docs/ZONAS-GRISES.md)

## Requisitos

- Node.js 24 (`nvm use`)
- Docker con Compose (PostgreSQL 16 en un contenedor, puerto host **5433**)

## Arranque

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:migrate
npm run seed
npm run dev        # web http://localhost:5173 · API :4000 · simulador MH :4100
```

Atajo de un solo comando (con `.env` ya creado y dependencias instaladas): `npm run start:demo`.

Credenciales de prueba: `daniela.reina@cicloandes.test` (Administrador) y `jose.hernandez@cicloandes.test` (Cajero), contraseña `Demo2026!`. Con `DEMO_MODE=true`, "Explorar el prototipo" abre el selector de rol.

## Scripts

| Script               | Qué hace                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run db:up`      | Levanta PostgreSQL 16 y espera al _healthcheck_                                                             |
| `npm run db:migrate` | Aplica las migraciones versionadas (`server/db/migrations`)                                                 |
| `npm run seed`       | Crea (o recrea) los datos de demostración: 214 productos, 86 clientes, 13 DTE con fechas relativas          |
| `npm run dev`        | Simulador MH + API + web en paralelo                                                                        |
| `npm run verify`     | Lint + Prettier + typecheck + pruebas unitarias e integración (PostgreSQL real, base `ciclo_andes_test`)    |
| `npm run e2e`        | Flujos F1–F8 con Playwright (reutiliza `npm run dev` si está corriendo; restablece los datos en cada flujo) |

## Arquitectura

```
web (React + Vite + Tailwind)  ──/api──►  server (Express + Kysely)  ──HTTP──►  mh-sim (simulador del MH)
                                            │  worker de contingencia            │
                                            └────────── PostgreSQL 16 ───────────┘
                                               esquema public          esquema mh_sim
```

- `server/domain/` — núcleo puro sin I/O: dinero en centavos, motor tributario (IVA 13 %, retención 1 %), costo promedio ponderado, numeración, tope de NCE, plazo de invalidación.
- `server/dte/stateMachine.ts` — **única** función `transition()` para cambiar el estado de un DTE; cada transición queda en `dte_event` (solo inserción, reforzado con triggers).
- `server/dte/` — constructores de JSON (FCFE, CCFE, NCE, evento de invalidación), firma JWS, pipeline de emisión, NCE, invalidación. Esquemas de demostración en `server/dte/schemas/` (ZG-11).
- `server/worker/contingency.ts` — worker con ping periódico, lotes con `FOR UPDATE SKIP LOCKED` y transmisión automática al volver la conexión.
- `mh-sim/` — simulador HTTP separado con su propio estado: valida firma, esquema, duplicados, padrón, NCE y plazos; modos En línea / Sin conexión / Lenta; rechazos configurables; modo lote.
- `web/` — pantallas por rol, tiempo real por SSE, carrito persistente, vistas térmicas de 80 mm.

## Máquina de estados del DTE

```
BORRADOR ──► FIRMADO ──► TRANSMITIDO ──► PROCESADO ──► INVALIDADO
                │             ├──► RECHAZADO
                │             └──► ENCOLADO (timeout, ZG-15)
                └──► ENCOLADO (sin conexión) ──► TRANSMITIDO ──► PROCESADO | RECHAZADO
```

## Requerimientos

Los requerimientos formales (SRS-REQ-_) están implementados según la sección 5 de la spec. Los identificados como **PRT-**_ son **propuestas del equipo** para cubrir vacíos de la documentación, no requerimientos formales; los supuestos provisionales están en `docs/ZONAS-GRISES.md` y se señalan en la UI como _Supuesto de demostración_.

## Pruebas

- **Unitarias**: motor tributario (ejemplo canónico 578.00 → 647.36, límites $100.00/$100.01), costo promedio, matriz completa de la máquina de estados, numeración, tope de NCE, plazo de invalidación.
- **Integración** (PostgreSQL real): triggers de inmutabilidad, unicidad bajo concurrencia, `SKIP LOCKED`, 401/403 por rol, transacción venta + DTE + stock con rollback, contingencia, invalidación, NCE, Corte Z.
- **Simulador**: firma inválida, JSON inválido, duplicado, NRC fuera del padrón, NCE sobre no sellado, lote con rechazos parciales, modos de conexión.
- **E2E**: F1–F8 con los siete estados persistentes de la sección 10.4.
