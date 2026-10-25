# Ciclo Andes — Prototipo funcional MVP DTE

Prototipo funcional (frontend + backend + simulador del Ministerio de Hacienda) de un sistema de Punto de Venta, Inventario y Facturación Electrónica (DTE) para MIPYMES salvadoreñas. Práctica Profesional (UCA).

> **Prototipo de demostración.** El Ministerio de Hacienda, el certificado de firma, el padrón de NRC, las pasarelas de tarjeta, la impresora térmica y el correo son **simulados**. No se conecta a ningún servicio gubernamental real.

La especificación completa está en [`docs/SPEC.md`](docs/SPEC.md).

## Requisitos

- Node.js 24 (`nvm use`)
- Docker con Compose (PostgreSQL 16 se ejecuta en un contenedor, puerto host **5433**)

## Arranque

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:migrate
npm run seed
npm run dev        # web :5173 · API :4000 · simulador MH :4100
```

Atajo de un solo comando (con `.env` ya creado): `npm run start:demo`.

## Scripts

| Script               | Qué hace                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run db:up`      | Levanta PostgreSQL 16 y espera al _healthcheck_                                                      |
| `npm run db:migrate` | Aplica las migraciones versionadas                                                                   |
| `npm run seed`       | Crea (o recrea) los datos de demostración                                                            |
| `npm run dev`        | Simulador MH + API + web en paralelo                                                                 |
| `npm run verify`     | Lint + typecheck + pruebas unitarias e integración (contra PostgreSQL real, base `ciclo_andes_test`) |
| `npm run e2e`        | Pruebas end-to-end con Playwright                                                                    |

## Estructura

- `server/` — API de negocio (Express, Kysely, PostgreSQL). Dominio puro en `server/domain/`, máquina de estados del DTE en `server/dte/stateMachine.ts`.
- `mh-sim/` — **simulador** del API del Ministerio de Hacienda, servicio HTTP separado.
- `web/` — aplicación React + Vite + Tailwind.
- `e2e/` — pruebas Playwright de los flujos de demostración.
- `docs/` — especificación, decisiones, zonas grises y guion de demostración.
