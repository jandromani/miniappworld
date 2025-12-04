# Trivia "50x15" Mini App — Plan de Fases

## Fase 1: Diseño funcional y esquema de pantallas
- Diseñar pantallas: Home, Modo Rápido, Torneos, Leaderboard, Perfil.
- Definir flujo de juego: 15 preguntas, comodines, temporizador, eliminación.
- Esquematizar datos: usuarios, partidas, torneos, bolsas de premios.
- Diseño mobile-first: navegación por pestañas, sin footers, uso de 100dvh.

## Fase 2: Boilerplate de Mini App (React/TypeScript + MiniKit)
- Configurar proyecto base con MiniKit integrado y variables de entorno (`APP_ID`, `DEV_PORTAL_API_KEY`).
- Instalar dependencias como `@worldcoin/minikit-js`, `@worldcoin/minikit-react`, Next.js y TypeScript.
- Añadir proveedor de MiniKit en `app/layout.tsx` y pantalla inicial en `app/page.tsx`.
- Comandos MiniKit: Wallet Auth, Verify.

## Fase 3: Lógica del juego "50x15"
- Implementar mecánica de trivia con 15 preguntas, temporizador y comodines.
- Crear base de preguntas (`lib/questions.ts`) y lógica (`lib/gameLogic.ts`).
- Comandos MiniKit: Send Haptic Feedback y, opcionalmente, Verify antes de iniciar partida.

## Fase 4: Pagos y Smart Contracts en World Chain
- Implementar buy-in, prize pools y distribución de premios.
- Contrato de torneos (`contracts/TournamentPool.sol`) y rutas API para pagos (`app/api/initiate-payment`, `app/api/confirm-payment`).
- Comandos MiniKit: Pay, Send Transaction.

## Fase 5: Leaderboard, notificaciones y growth
- Construir `app/leaderboard/page.tsx` con clasificación y endpoints para notificaciones.
- Comandos MiniKit: Send Notifications, Share, Quick Actions.

## Fase 6: Pruebas en testnet y despliegue
- Desplegar contratos en World Chain Sepolia y probar pagos, torneos y leaderboard.
- Configurar URL en Developer Portal y usar ngrok para pruebas móviles.
- Preparar envío para revisión en la App Store de Mini Apps.

## Resumen de comandos MiniKit por fase
- Fase 2: Wallet Auth, Verify
- Fase 3: Send Haptic Feedback, Verify
- Fase 4: Pay, Send Transaction
- Fase 5: Send Notifications, Share, Quick Actions
