# Fase 1 — Diseño funcional de la mini app de trivia "50x15"

Este documento resume el flujo de pantallas, tipos principales y comandos de MiniKit
necesarios para la primera fase de la mini app. El alcance se centra en un modo de
juego base con soporte para torneos y verificación de identidad con World ID.

## 1. Diagrama textual del flujo de pantallas
```
┌─────────────────────────────────────────────────────────────────┐
│ HOME / LOBBY                                                    │
│ - Botón "Partida Rápida" (1 vs sistema)                        │
│ - Botón "Torneo" (multijugador, buy-in)                        │
│ - Botón "Práctica" (sin premios)                               │
│ - Leaderboard global (top 10)                                   │
│ - Perfil del usuario (stats, historial)                         │
│ - [TRIGGER: Verify (World ID) al primer acceso]                │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ SELECCIÓN DE MODO                                               │
│ - Si "Partida Rápida": → Pantalla de Juego (sin buy-in)        │
│ - Si "Torneo": → Pantalla de Buy-In (Pay command)              │
│ - Si "Práctica": → Pantalla de Juego (sin premios)             │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ PANTALLA DE BUY-IN (solo torneos)                              │
│ - Seleccionar token (WLD, USDC, memecoin)                      │
│ - Mostrar prize pool acumulado                                 │
│ - Botón "Pagar y Entrar" → [TRIGGER: Pay command]              │
│ - [TRIGGER: Verify si no se hizo antes]                        │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ PANTALLA DE JUEGO (15 preguntas)                               │
│ - Pregunta actual (enunciado + 4 opciones)                     │
│ - Contador de tiempo (barra visual)                            │
│ - Comodines disponibles (50/50, Público, Cambiar)              │
│ - Progreso: "Pregunta 3/15"                                    │
│ - Puntos acumulados                                            │
│ - [TRIGGER: Send Haptic Feedback al responder]                 │
│ - Si falla → Pantalla de Resumen (derrota)                     │
│ - Si completa 15 → Pantalla de Resumen (victoria)              │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ PANTALLA DE RESUMEN                                            │
│ - Puntos totales                                               │
│ - Preguntas correctas/incorrectas                              │
│ - Tiempo total                                                 │
│ - Posición en leaderboard (si torneo)                          │
│ - Botón "Jugar de Nuevo"                                       │
│ - Botón "Ver Leaderboard"                                      │
│ - [TRIGGER: Send Notification si ganó torneo]                  │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Definición de tipos TypeScript

### Pregunta
```ts
interface Question {
  id: string; // UUID único
  category: string; // "Historia", "Ciencia", "Deportes", etc.
  difficulty: 1 | 2 | 3 | 4 | 5; // 1=fácil, 5=muy difícil
  text: string; // Enunciado de la pregunta
  options: [string, string, string, string]; // Exactamente 4 opciones
  correctIndex: 0 | 1 | 2 | 3; // Índice de la opción correcta
  maxTime: number; // Tiempo máximo en segundos (ej: 30)
  points: number; // Puntos que otorga (ej: 100 * difficulty)
}
```

### Sesión de juego
```ts
interface GameSession {
  sessionId: string; // UUID de la sesión
  userId: string; // nullifier_hash de World ID (prueba de persona única)
  mode: "quick" | "tournament" | "practice";
  tournamentId?: string; // Solo si mode === "tournament"
  questions: Question[]; // Array de 15 preguntas ordenadas por dificultad
  currentQuestionIndex: number; // 0-14
  answers: Array<{
    questionId: string;
    selectedIndex: number | null; // null si no respondió (timeout)
    isCorrect: boolean;
    timeSpent: number; // Segundos
  }>;
  lifelines: {
    fiftyFifty: boolean; // true si aún disponible
    askAudience: boolean;
    changeQuestion: boolean;
  };
  score: number; // Puntos acumulados
  startedAt: Date;
  finishedAt?: Date;
  status: "in_progress" | "completed" | "failed";
}
```

### Estadísticas del jugador
```ts
interface PlayerStats {
  userId: string; // nullifier_hash de World ID
  walletAddress: string; // Dirección de wallet (de Wallet Auth)
  username: string; // Username de World App
  totalGamesPlayed: number;
  totalWins: number;
  totalLosses: number;
  highestScore: number;
  averageScore: number;
  tournamentsWon: number;
  totalEarnings: string; // En WLD/USDC (formato string para BigInt)
  lastPlayedAt: Date;
}
```

### Torneo
```ts
interface Tournament {
  tournamentId: string;
  buyInToken: "WLD" | "USDC" | "MEMECOIN"; // Token del buy-in
  buyInAmount: string; // Cantidad en wei (string para BigInt)
  prizePool: string; // Acumulado en wei
  participants: Array<{
    userId: string;
    score: number;
    finishedAt: Date;
  }>;
  startedAt: Date;
  endsAt: Date;
  status: "open" | "in_progress" | "finished";
  winners?: Array<{
    userId: string;
    rank: number;
    prize: string; // En wei
  }>;
}
```

## 3. Flujo de una partida individual

### A. Pantalla de Lobby / Home
- Lanzar `Verify (World ID)` en el primer acceso para obtener `nullifier_hash`.
- Mostrar botones: "Partida Rápida", "Torneo", "Práctica".
- Mostrar leaderboard global (top 10) y perfil básico del usuario.

### B. Selección de modo
- **Partida Rápida**: carga 15 preguntas aleatorias ordenadas por dificultad → Pantalla de Juego.
- **Torneo**: redirige a Pantalla de Buy-In.
- **Práctica**: igual que Partida Rápida pero sin premios ni persistencia de stats.

### C. Pantalla de Buy-In (solo torneos)
- Seleccionar token (WLD, USDC, memecoin) y mostrar prize pool acumulado.
- Ejecutar comando `pay` al pulsar "Pagar y Entrar" y validar pago en backend.
- Si el usuario no está verificado, volver a lanzar `verify` antes de permitir el pago.

### D. Pantalla de Juego (15 preguntas)
- Cargar 15 preguntas ascendentes en dificultad (1→5).
- Por cada pregunta: mostrar enunciado, opciones, temporizador y progreso ("Pregunta 3/15").
- Comodines (un uso cada uno): 50/50, Preguntar al Público, Cambiar Pregunta.
- Al responder, enviar `sendHapticFeedback` (success/error) y sumar puntos si acierta.
- Fallo o timeout → Pantalla de Resumen (derrota); completar 15 → Pantalla de Resumen (victoria).

### E. Pantalla de Resumen
- Mostrar puntos totales, correctas/incorrectas, tiempo total y posición en leaderboard (torneos).
- Botones: "Jugar de Nuevo", "Ver Leaderboard".
- Si ganó un torneo, enviar notificación desde backend.

## 4. Guardado de histórico de partidas
- **Cliente**: guardar `GameSession` completo en IndexedDB/localStorage para reanudar o
  mostrar la última partida.
- **Backend (PostgreSQL/Supabase)**: persistir sesiones y stats mínimas.
  ```sql
  CREATE TABLE game_sessions (
    session_id UUID PRIMARY KEY,
    user_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    tournament_id UUID,
    score INT NOT NULL,
    status TEXT NOT NULL,
    started_at TIMESTAMP NOT NULL,
    finished_at TIMESTAMP,
    answers JSONB NOT NULL
  );

  CREATE TABLE player_stats (
    user_id TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    username TEXT NOT NULL,
    total_games_played INT DEFAULT 0,
    total_wins INT DEFAULT 0,
    highest_score INT DEFAULT 0,
    last_played_at TIMESTAMP
  );
  ```
- **Smart contract (opcional, torneos)**: registrar `tournamentId`, `userId`, `score`
  on-chain con `sendTransaction` para transparencia.

## 5. Integración de comandos MiniKit por pantalla
- **Lobby**: `verify` en el primer acceso (`VerificationLevel.Orb`).
- **Buy-In**: `pay` al confirmar la entrada y re-lanzar `verify` si no hay prueba.
- **Juego**: `sendHapticFeedback` al responder cada pregunta.
- **Resumen**: `sendNotification` al ganador del torneo.

## 6. Ejemplos de código

### Verify en el lobby
```ts
const { finalPayload } = await MiniKit.commandsAsync.verify({
  action: 'trivia_game_access',
  verification_level: VerificationLevel.Orb
});
```

### Pay para buy-in
```ts
const { finalPayload } = await MiniKit.commandsAsync.pay({
  reference: tournamentId,
  to: TOURNAMENT_CONTRACT_ADDRESS,
  tokens: [{ symbol: Tokens.WLD, token_amount: '1000000000000000000' }],
  description: 'Tournament entry'
});
```

### Haptic feedback en las respuestas
```ts
MiniKit.commands.sendHapticFeedback({
  hapticsType: 'notification',
  style: 'success'
});
```

### Notificación al ganar torneo
```ts
await fetch('/api/send-notification', {
  method: 'POST',
  body: JSON.stringify({
    userId,
    message: '🎉 You won the tournament! Prize: 100 WLD'
  })
});
```
