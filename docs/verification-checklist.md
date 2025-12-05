# Pasos de verificación tras refactors de pagos y torneos

Esta checklist resume los pasos manuales y automáticos para validar el flujo de pago y torneos
luego de cambios recientes (session_token, protección CSRF y colas de eventos).

## Flujo de autenticación y sesión
1. Genera y almacena `session_token` en el backend al iniciar la sesión de juego.
2. Verifica que el token se renueve en cada ciclo de pago/torneo (no reutilizar tokens expirados).
3. Confirma que los endpoints usan el `session_token` en cabecera/cookie HTTP-Only y que el valor se valida contra el store en `src/lib/session`.
4. Fuerza un `session_token` inválido desde las pruebas de integración y comprueba que responde 401/403 sin tocar los recursos del jugador.

## Protección CSRF en endpoints
1. Confirma que las páginas con formularios incluyen el meta `csrfToken` (ver `src/app/layout.tsx`).
2. Envía peticiones POST sin el header `x-csrf-token` o con valor alterado y espera 403.
3. Comprueba que los endpoints de pago (`/api/initiate-payment`, `/api/confirm-payment`) rechazan origenes no permitidos (CORS) y no aceptan métodos distintos a POST.
4. Revisa que los logs de auditoría registran intentos fallidos de CSRF con identificador de sesión hash.

## Colas y persistencia de eventos
1. Publica eventos de pago y torneo en la cola interna (`src/lib/queues/paymentQueue.ts`) y confirma que se encolan con idempotency key.
2. Simula duplicación de mensajes: vuelve a publicar el mismo evento y verifica que el consumidor ignora los duplicados.
3. Mide el tiempo de reintento: provoca un error temporal en el consumidor y comprueba que reintenta con backoff hasta agotar el máximo.
4. Verifica que, ante fallo definitivo, el evento se marca como "dead-letter" y se envía a la auditoría (`data/audit.log`) con el motivo.

## Pago (pay + verify)
1. Ejecuta `MiniKit.commandsAsync.pay` desde el cliente con referencia de torneo y token permitido.
2. El backend valida el pago en el Developer Portal y guarda el hash en `src/lib/paymentService.ts`.
3. Llama a `/api/confirm-payment` con el `session_token` activo y confirma que la respuesta contiene `status=confirmed`.
4. Repite el flujo con token expirado para asegurar que la respuesta es 401 y no se registra pago.

## Torneo
1. Crea un torneo mock desde `/api/tournaments/create` usando la whitelist local de tokens.
2. Ejecuta `joinTournament(tournamentId)` desde el backend tras un pago válido y confirma que el jugador aparece en el leaderboard (`src/app/leaderboard/page.tsx`).
3. Fuerza un jugador duplicado y verifica que el store rechaza la inscripción repetida.
4. Ejecuta `submitScore` y `finalizeTournament` y confirma que las auditorías registran el flujo completo.

## Seguridad adicional
- Revisa que todos los logs de pago/torneo se hashifican con `LOG_HASH_SECRET` antes de persistir.
- Usa `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` para rate limiting distribuido; si faltan, anota la limitación en el informe de QA.
- Comprueba que los endpoints solo aceptan tokens de la whitelist local (`WLD`, `USDC`, `MEMECOIN_CONFIG`).

## Checklist rápida previa a release
- [ ] CSRF activo y probado con request maliciosas.
- [ ] `session_token` renovado y validado en pagos/torneos.
- [ ] Colas con idempotencia y manejo de reintentos probado.
- [ ] Auditorías con hash y retención configurada.
- [ ] Rate limiting distribuido habilitado (o documentado si falta).
- [ ] Tokens de pago whitelisteados y verificados.
