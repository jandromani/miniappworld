# Trivia 50x15 — Mini App con MiniKit

Implementación inicial de la mini app de trivia descrita en el plan de fases. Incluye
boilerplate Next.js + TypeScript, integración de MiniKit, mecánica de juego con
comodines, endpoints de pagos y contrato de torneos en World Chain.

## Requisitos
- Node.js 18+
- Variables de entorno definidas en `.env` (ver `.env.example`).
  - Define `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` para habilitar rate limiting distribuido entre réplicas. Si no están
    presentes se usa un bucket en memoria (solo recomendado para desarrollo local).

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
- `app/api/tournaments/create`: Valida (mock) la creación de torneos y whitelist de tokens.
- `contracts/TournamentManager.sol`: Contrato principal para registrar torneos, manejar buy-ins y distribuir premios usando ERC-20.
- `contracts/TournamentPool.sol`: Contrato simple para pools de torneos (ejemplo legacy).

## Páginas
- `/`: Overview del proyecto y fases.
- `/game`: Juego de trivia con 15 preguntas, temporizador y comodines (50/50, salto, público).
- `/leaderboard`: Tabla de clasificación y guía para notificaciones.

## Diseño funcional
- Consulta el desglose completo de la Fase 1 (pantallas, tipos y comandos MiniKit) en
  `docs/fase1-functional-design.md`.

## Despliegue de contratos en World Chain

Las rutas de documentación relevantes son:
- Deploy Smart Contracts: `/world-chain/developers/deploy`
- World Chain Contracts: `/world-chain/developers/world-chain-contracts`
- Smart Contract Guidelines: `/mini-apps/guidelines/smart-contract-development-guidelines`

### Preparar Foundry
1. Instala Foundry (forge/anvil) en tu entorno local.
2. Copia la configuración de `foundry.toml` (src/test/script apuntan a `contracts`, `test` y `scripts`).
3. Instala dependencias si lo necesitas (p.ej. openzeppelin-contracts) o usa las utilidades incluidas en `contracts/lib/openzeppelin`.

### Desplegar con script
1. Define la variable de entorno `OWNER` con la address administradora que se registrará en el contrato.
2. Ejecuta el script:
   ```bash
   forge script scripts/deploy.s.sol --rpc-url <RPC_WORLD_CHAIN> --broadcast
   ```
3. Añade la address del contrato desplegado a la whitelist del Developer Portal (Settings → Advanced) para habilitar el patrocinio de gas.

## Integración de memecoin PUF (custom ERC-20)

- Define tu token en `src/lib/constants.ts` (MEMECOIN_CONFIG) con dirección, símbolo, decimales y URL de Quick Action `worldapp://mini-app?app_id=app_puf&path=app/token/<address>`.
- Selecciona tokens de pago en `src/app/tournament/buy-in/page.tsx` y `src/app/tournament/[tournamentId]/page.tsx`; ambos muestran CTA para abrir el token en PUF cuando está disponible.
- El servicio de pagos (`src/lib/paymentService.ts`) convierte montos a decimales y soporta WLD, USDC y el memecoin como tokens custom.
- Los torneos pueden declararse por JSON (`src/config/tournaments.json`) incluyendo `acceptedTokens` con addresses soportadas.
- El endpoint `/api/tournaments/create` valida que el buy-in y la lista de tokens pertenezcan a la whitelist local (WLD, USDC, MEMECOIN).

## Flujo MiniKit: Pay vs Send Transaction

### Opción A — Pay + llamada del backend (recomendada)
1. El cliente llama a `MiniKit.commandsAsync.pay` con `reference = tournamentId`, `to = TOURNAMENT_CONTRACT_ADDRESS` y el token/cantidad de buy-in.
2. El backend verifica el pago en el Developer Portal y luego ejecuta `joinTournament(tournamentId)` desde una wallet autorizada (puede ser relayer) para inscribir al jugador.

### Opción B — Send Transaction directa
1. El jugador aprueba el token o usa Permit2.
2. El cliente ejecuta `MiniKit.commandsAsync.sendTransaction` invocando `joinTournament(tournamentId)`; World App patrocina el gas.
3. El contrato hace `transferFrom` para cobrar el buy-in y registrar al jugador.

### Finalizar torneo y distribuir premios
1. Una address autorizada registra los scores con `submitScore` (backend) o `submitScoreWithSignature` (firma del jugador).
2. El owner llama a `finalizeTournament` para fijar los ganadores y luego a `distributePrizes` para enviar los premios via ERC-20.
3. Estas llamadas también pueden hacerse con `sendTransaction` patrocinado.

## Testing
- Tests de contratos en Foundry: `forge test`.
- Tests unitarios/integración de Mini App (Jest): `npm test`.
- Ejecución en CI (serializado): `npm run test:ci`.

Las pruebas de Jest utilizan mocks deterministas del Developer Portal y World ID para simular Verify + Pay + Join, validar montos/tokenes y verificar el manejo de errores (identidad no verificada, pagos rechazados o confirmaciones fallidas).

## Próximos pasos sugeridos
- Conectar `pay` y `sendTransaction` desde el cliente usando los endpoints.
- Persistir progreso y leaderboard en base de datos.
- Desplegar el contrato en World Chain Sepolia y apuntar `NEXT_PUBLIC_TREASURY_ADDRESS`.
