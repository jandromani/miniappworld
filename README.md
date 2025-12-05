# Trivia 50x15 — Mini App con MiniKit

Implementación inicial de la mini app de trivia descrita en el plan de fases. Incluye
boilerplate Next.js + TypeScript, integración de MiniKit, mecánica de juego con
comodines, endpoints de pagos y contrato de torneos en World Chain.

## Requisitos
- Node.js 18+
- Variables de entorno definidas en `.env` (ver `.env.example`).
  - Al iniciar se validan las claves críticas: `APP_ID`, `DEV_PORTAL_API_KEY`, `NEXT_PUBLIC_APP_ID`, `NEXT_PUBLIC_DEV_PORTAL_API_KEY`, `NEXT_PUBLIC_RECEIVER_ADDRESS` y al menos una de `NOTIFICATIONS_API_KEY` o `NOTIFICATIONS_API_KEYS`.
  - Define `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` para habilitar rate limiting distribuido entre réplicas. Si no están
    presentes se usa un bucket en memoria (solo recomendado para desarrollo local).

## Scripts
```bash
npm install
npm run dev
npm run build
npm run start
```

## Auditoría y rotación de logs
- El archivo `data/audit.log` rota automáticamente cuando cambia el día o al alcanzar el tamaño configurado (5 MB por defecto, puedes ajustar con `AUDIT_LOG_MAX_SIZE_BYTES`).
- Desactiva la rotación diaria con `AUDIT_LOG_ROTATE_DAILY=false` si solo quieres rotar por tamaño.
- Define `AUDIT_LOG_RETENTION_DAYS` para purgar archivos de auditoría rotados y limitar la retención mínima (30 días por defecto).
- Reenvío opcional a servicios externos:
- `AUDIT_LOG_HTTP_ENDPOINT` (+ `AUDIT_LOG_HTTP_AUTHORIZATION`): envía cada entrada como `POST` JSON, pensado para ingestas HTTP (ELK, webhooks).
- `AUDIT_LOG_CLOUDWATCH_GROUP` y `AUDIT_LOG_CLOUDWATCH_STREAM` (+ `AWS_REGION`): publica las entradas en CloudWatch Logs, creando el grupo/stream si no existen.
- Controla el timeout del reenvío con `AUDIT_LOG_FORWARD_TIMEOUT_MS` (4s por defecto).

## Observabilidad y respuesta a incidentes
- Las métricas expuestas en `/api/metrics` cubren fallos de API, pagos, contención/deadlocks y latencias de transacción.
- Consulta `docs/observability.md` para configurar alertas (pagos fallidos, tasa de errores y contención), centralizar logs/auditorías en tu stack de observabilidad y practicar simulacros de incidentes.

## Copias y restauración de `data/`
- Genera snapshots versionados de la carpeta `data/` y metadata (hash, tamaño, fecha) con:
  ```bash
  npm run data:snapshot -- --label pre-torneo
  ```
- Lista los snapshots disponibles (ordenados por fecha) para verificar su antigüedad antes de desplegar:
  ```bash
  npm run data:snapshot:list
  npm run data:snapshot:verify -- --max-age-hours 24
  ```
- Restaura el snapshot más reciente o uno específico si necesitas rebobinar el estado local:
  ```bash
  npm run data:snapshot:restore             # usa el último snapshot
  npm run data:snapshot:restore -- --id <id>
  ```
- Los snapshots se guardan en `data/.snapshots/` (ignorada en git) y la restauración purga la carpeta `data/` manteniendo solo el snapshot seleccionado.
## Protección de datos en repositorio
- Todas las entradas de auditoría y logs de API se pseudonimizan (hash SHA-256 con `LOG_HASH_SECRET`) para evitar exponer IDs de usuario, wallets, tokens o referencias sensibles.
- Puedes cifrar en reposo el archivo `data/database.json` habilitando `DATA_ENCRYPTION_KEY` (AES-256-GCM). Si usas un backend gestionado, considera migrar el almacenamiento local a una base de datos segura (PostgreSQL/Redis) y mantener `DISABLE_LOCAL_STATE=true` para evitar escribir a disco.

## Migración a bases de datos transaccionales

- El almacenamiento local con journaling y watchdog de locks está pensado para entornos de desarrollo o despliegues pequeños. Para producción, evalúa migrar a una base transaccional (PostgreSQL/Redis) que gestione concurrencia y durabilidad.
- Configura `DB_DIALECT=postgres` o `DB_DIALECT=redis` junto con tus credenciales para preparar la transición; el código usa esta señal para ajustar niveles de aislamiento y tiempos de espera.
- Cuando delegues el estado a una base gestionada, define `DISABLE_LOCAL_STATE=true` para evitar escrituras en disco y asegurar compatibilidad con réplicas sin almacenamiento local. Mantén `STATE_DIRECTORY` apuntando a un volumen efímero solo si necesitas un respaldo puntual en el entorno actual.

## Configuración de MiniKit
Define en `.env`:
- `APP_ID` y `NEXT_PUBLIC_APP_ID`: ID de la mini app desde Developer Portal.
- `DEV_PORTAL_API_KEY` y `NEXT_PUBLIC_DEV_PORTAL_API_KEY`: API key de Developer Portal.
- `NEXT_PUBLIC_ACTION`: Action ID de World ID (ej. `trivia_game_access`).
- `NEXT_PUBLIC_TREASURY_ADDRESS`: Address que recibe buy-ins.
- `NEXT_PUBLIC_RECEIVER_ADDRESS`: Address que recibe pagos simulados en el backend.
- `NOTIFICATIONS_API_KEY` o `NOTIFICATIONS_API_KEYS`: Claves para autenticar `/api/send-notification`.

El proveedor de MiniKit se inicializa en `app/providers.tsx` y ejecuta `walletAuth` al
montar la app. En la pantalla de juego (`/game`) puedes lanzar `verify` para validar
World ID y `sendHapticFeedback` para feedback táctil.

### Consola móvil (Eruda)
- Activa el flag `NEXT_PUBLIC_ENABLE_ERUDA=true` para cargar la consola móvil (se
  inicializa en `src/components/DevConsoleLoader.tsx`).
- Úsala para inspeccionar logs y red dentro de World App cuando hagas pruebas
  manuales.

## Guía de pruebas end-to-end (Developer Portal + World App)

### Configuración inicial
- 🛠️ Developer Portal: crea la app "Trivia 50x15" (Games) y copia `APP_ID`,
  `DEV_PORTAL_API_KEY` y `NEXT_PUBLIC_ACTION=trivia_game_access` en `.env.local`.
- 🛠️ World ID: registra la action `trivia_game_access` en la sección World ID y
  usa el mismo valor en `NEXT_PUBLIC_ACTION` para que el backend valide la acción.
- 🛠️ URL pública: levanta `pnpm dev`/`npm run dev` en localhost:3000, expón con
  `ngrok http 3000` y pega la URL en Developer Portal → Settings → App URL.
- ✅ Validaciones en runtime: el backend exige `NEXT_PUBLIC_ACTION`, IDs de app,
  API keys y receiver/treasury para evitar pruebas con configuración incompleta.

### Pasos previos a probar en móvil
- 🛠️ Fondos de testnet: solicita WLD en el faucet de World Chain Sepolia antes de
  probar los pagos.
- 🛠️ QR de test: genera el QR en la página de testing del portal con tu `APP_ID`
  y escanéalo desde World App.

### Casos críticos a validar
- Verify + Pay + juego: en `/` pulsa "Verificar con World ID" (usa el Worldcoin
  Simulator si es testnet), luego "Partida Rápida" y confirma el pago de 1 WLD.
- Pagos fallidos: cancela el flujo de Pay o prueba con saldo insuficiente; la UI
  debe mostrar el error devuelto por MiniKit.
- Torneos: inscríbete desde `/tournament`, confirma el buy-in, juega y verifica que
  el score aparece en `/leaderboard`. El endpoint `/api/send-notification` permite
  simular el push al ganador.
- Notificaciones programadas: configura tu cron/worker externo para llamar al
  endpoint de notificaciones antes de iniciar/finalizar torneos (ver guía de
  mensajes en los pasos del usuario).

### Observabilidad y debugging
- ✅ Eruda opcional vía `NEXT_PUBLIC_ENABLE_ERUDA`.
- ✅ Logs/auditoría persistentes en `data/` con rotación y hash de PII.
- 🛠️ Worldscan/Developer API: usa `transaction_id` en
  `https://developer.worldcoin.org/api/v2/minikit/transaction/{id}` para confirmar
  pagos desde tu wallet de testnet.

## Endpoints y contratos
- `app/api/initiate-payment`: Genera payload para comando `pay`.
- `app/api/confirm-payment`: Confirma y registra hashes de pago.
- `app/api/send-notification`: Simula el envío de notificaciones a ganadores.
  - Usa un archivo duradero `data/notification-keys.json` para mantener una lista de claves y roles activos.
  - Ejemplo: `{ "keys": [{ "key": "api-key-1", "role": "ops" }, { "key": "api-key-2", "role": "marketing", "revoked": false }] }`.
  - También escribe auditorías en `data/notification-audit.log` (un registro por línea en formato JSON).
- `app/api/tournaments/create`: Valida (mock) la creación de torneos y whitelist de tokens.
- `contracts/TournamentManager.sol`: Contrato principal para registrar torneos, manejar buy-ins y distribuir premios usando ERC-20.
- `contracts/TournamentPool.sol`: Contrato simple para pools de torneos (ejemplo legacy).

### API keys para `/api/send-notification`
- Usa `NOTIFICATIONS_API_KEYS` como un JSON string con múltiples claves y expiraciones opcionales, por ejemplo:
  ```bash
  NOTIFICATIONS_API_KEYS='[{"key":"clave-actual","expiresAt":"2025-01-01T00:00:00Z"},{"key":"clave-anterior"}]'
  ```
- Como fallback, puedes definir `NOTIFICATIONS_API_KEY` con una sola clave.
- El formato se valida al arrancar la aplicación; si es inválido se lanzará un error temprano.
La capa de persistencia vive en `src/lib/database.ts`, que centraliza pagos, torneos y auditorías. El store antiguo de pagos fue retirado para evitar caminos de importación duplicados.

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

### Pruebas móviles de juego y pagos
- Ejecuta `npm test -- --runTestsByPath __tests__/gamePage.mobile.test.tsx __tests__/tournamentBuyIn.mobile.test.tsx` para
  validar los estilos responsivos en pantallas reducidas.
- Verificación manual en 360x640 (móvil):
  - `/game`: el header se apila, las estadísticas se muestran en 2 columnas y los botones de respuesta ocupan todo el ancho.
  - `/tournament/buy-in`: los botones de modo se apilan, la grilla de tokens usa 2 columnas y el CTA de pago es de ancho
    completo.

Las pruebas de Jest utilizan mocks deterministas del Developer Portal y World ID para simular Verify + Pay + Join, validar montos/tokenes y verificar el manejo de errores (identidad no verificada, pagos rechazados o confirmaciones fallidas).

## Próximos pasos sugeridos
- Conectar `pay` y `sendTransaction` desde el cliente usando los endpoints.
- Persistir progreso y leaderboard en base de datos.
- Desplegar el contrato en World Chain Sepolia y apuntar `NEXT_PUBLIC_TREASURY_ADDRESS`.
