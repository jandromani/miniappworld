/**
 * Cron job de ejemplo para enviar notificaciones cuando un torneo va a comenzar.
 * Sustituye las funciones stub de base de datos por implementaciones reales (Supabase, PostgreSQL, etc.).
 */

type TournamentRecord = {
  tournamentId: string;
  name: string;
  startTime: Date;
  status: 'upcoming' | 'active' | 'finished';
};

type TournamentEntryRecord = {
  tournamentId: string;
  walletAddress: string;
  username: string;
};

async function fetchUpcomingTournaments(): Promise<TournamentRecord[]> {
  // TODO: Sustituir por consulta real a BD
  return [];
}

async function fetchParticipants(tournamentId: string): Promise<TournamentEntryRecord[]> {
  // TODO: Sustituir por consulta real a BD
  return [];
}

export async function notifyUpcomingTournaments() {
  const tournaments = await fetchUpcomingTournaments();

  for (const tournament of tournaments) {
    const participants = await fetchParticipants(tournament.tournamentId);
    if (participants.length === 0) continue;

    const walletAddresses = participants.map((p) => p.walletAddress);

    await fetch('http://localhost:3000/api/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddresses,
        title: '🏆 Tournament Starting Soon!',
        message: `Hey ${participants[0]?.username ?? 'player'}, your tournament starts in 15 minutes!`,
        miniAppPath: `worldapp://mini-app?app_id=${process.env.APP_ID}&path=/tournament/${tournament.tournamentId}`,
      }),
    });
  }
}

// Permite ejecutar el script manualmente en un entorno de cron o serverless
if (require.main === module) {
  notifyUpcomingTournaments()
    .then(() => {
      console.log('Notificaciones procesadas');
    })
    .catch((err) => {
      console.error('Error al enviar notificaciones', err);
      process.exit(1);
    });
}
