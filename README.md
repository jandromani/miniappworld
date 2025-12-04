# Trivia 50x15 — Mini App con MiniKit

Implementación inicial de la mini app de trivia descrita en el plan de fases. Incluye
boilerplate Next.js + TypeScript, integración de MiniKit, mecánica de juego con
comodines, endpoints de pagos y contrato de torneos en World Chain.

## Requisitos
- Node.js 18+
- Variables de entorno definidas en `.env` (ver `.env.example`).

## Scripts
```bash
npm install
npm run dev
npm run build
npm run start
```

## Configuración de MiniKit
Define en `.env`:
- `NEXT_PUBLIC_APP_ID`: ID de la mini app desde Developer Portal.
- `NEXT_PUBLIC_DEV_PORTAL_API_KEY`: API key de Developer Portal.
- `NEXT_PUBLIC_TREASURY_ADDRESS`: Address que recibe buy-ins.

El proveedor de MiniKit se inicializa en `app/providers.tsx` y ejecuta `walletAuth` al
montar la app. En la pantalla de juego (`/game`) puedes lanzar `verify` para validar
World ID y `sendHapticFeedback` para feedback táctil.

## Endpoints y contratos
- `app/api/initiate-payment`: Genera payload para comando `pay`.
- `app/api/confirm-payment`: Confirma y registra hashes de pago.
- `app/api/send-notification`: Simula el envío de notificaciones a ganadores.
- `contracts/TournamentPool.sol`: Contrato simple para pools de torneos.

## Páginas
- `/`: Overview del proyecto y fases.
- `/game`: Juego de trivia con 15 preguntas, temporizador y comodines (50/50, salto, público).
- `/leaderboard`: Tabla de clasificación y guía para notificaciones.

## Diseño funcional
- Consulta el desglose completo de la Fase 1 (pantallas, tipos y comandos MiniKit) en
  `docs/fase1-functional-design.md`.

## Próximos pasos sugeridos
- Conectar `pay` y `sendTransaction` desde el cliente usando los endpoints.
- Persistir progreso y leaderboard en base de datos.
- Desplegar el contrato en World Chain Sepolia y apuntar `NEXT_PUBLIC_TREASURY_ADDRESS`.
