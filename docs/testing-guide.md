# Guía de pruebas (unitarias, integración y E2E)

## Tipos de pruebas
- **Unitarias (Jest)**: funciones puras y hooks aislados (`src/lib`, `src/hooks`).
- **Integración (Jest + Next test environment)**: API routes (`src/app/api/**/route.ts`) y componentes con MiniKit mockeado.
- **E2E (Playwright/Jest móvil)**: flujos completos de juego/pago en navegadores reales o viewport móvil.

## Configuración de mocks
- Los mocks compartidos viven en `__mocks__/` y se activan automáticamente por Jest.
- `jest.setup.ts` registra los mocks de MiniKit, World ID y Developer Portal.
- Para APIs externas adicionales, añade mocks en `__mocks__/fetch.ts` o crea un mock específico junto al test (`__mocks__/service.mock.ts`).

## Cómo ejecutar
1. **Unitarias**
   ```bash
   npm test -- --runTestsByPath __tests__/unit
   ```
   - Usa snapshots sólo cuando sean estables; preferir asserts explícitos.

2. **Integración de API y componentes**
   ```bash
   npm test -- --runTestsByPath __tests__/integration
   ```
   - Habilita `FORCE_MOCK_MINIKIT=true` para evitar llamadas reales.
   - Inyecta `SESSION_TOKEN=test-session` cuando valides flujo de pago/torneo.

3. **E2E / móviles**
   ```bash
   npm test -- --runTestsByPath __tests__/gamePage.mobile.test.tsx __tests__/tournamentBuyIn.mobile.test.tsx
   ```
   - Usa viewport 360x640 y verifica layout móvil.
   - Mantén `NEXT_PUBLIC_APP_ENV=staging` para pruebas conectadas a staging; en local usar `local` para mocks totales.

## Pruebas con mocks avanzados
- **Pagos**: sobrescribe `process.env.DEV_PORTAL_API_KEY="mock"` y habilita `USE_PAYMENT_MOCK=true` para evitar llamadas reales.
- **Colas**: activa `QUEUE_DRIVER=memory` para validar idempotencia y reintentos sin dependencias externas.
- **CSRF**: envía `x-csrf-token` desde los tests; si falta, espera 403 para confirmar el middleware.

## Cobertura y CI
- Genera cobertura local con `npm run test:coverage` y revisa `coverage/lcov-report/index.html`.
- El pipeline `npm run test:ci` corre unitarias + integración en modo serial para evitar condiciones de carrera.

## Tips
- Evita depender del reloj real: usa `jest.useFakeTimers()` en flows con expiración de `session_token`.
- Limpia stores en `beforeEach` (`src/lib/database.ts` tiene helpers de reset en mocks) para evitar fugas entre tests.
