import { enqueueNotification } from '@/lib/queues/notificationQueue';
import { findPaymentByReference, listTournamentParticipants } from '@/lib/database';
import { listTournaments } from '@/lib/server/tournamentData';
import { Tournament } from '@/lib/types';
import { isValidEvmAddress } from '@/lib/addressValidation';

const JOB_INTERVAL_MS = 60_000;
const MAX_WALLETS_PER_REQUEST = 50;

const globalState = globalThis as typeof globalThis & {
  tournamentNotificationJobStarted?: boolean;
  tournamentNotificationState?: Record<string, { startNotified: boolean; endNotified: boolean }>;
};

function getState() {
  if (!globalState.tournamentNotificationState) {
    globalState.tournamentNotificationState = {};
  }

  return globalState.tournamentNotificationState;
}

const isValidWalletAddress = (address?: string) => isValidEvmAddress(address);

async function getParticipantWallets(tournamentId: string) {
  const participants = await listTournamentParticipants(tournamentId);

  const wallets = await Promise.all(
    participants.map(async (participant) => {
      const payment = await findPaymentByReference(participant.payment_reference);
      return payment?.wallet_address;
    })
  );

  const validWallets = wallets.filter((wallet): wallet is string => isValidWalletAddress(wallet));

  return Array.from(new Set(validWallets));
}

async function notifyParticipants(tournament: Tournament, phase: 'start' | 'end') {
  const walletAddresses = await getParticipantWallets(tournament.tournamentId);
  if (!walletAddresses.length) return;

  const title = phase === 'start'
    ? `¡${tournament.name} ha comenzado!`
    : `El torneo ${tournament.name} ha finalizado`;
  const message = phase === 'start'
    ? 'Entra ahora para competir y subir en el leaderboard.'
    : 'Revisa tus resultados y reclamá tus premios si aplican.';
  const miniAppPath = `/tournament/${tournament.tournamentId}`;

  for (let i = 0; i < walletAddresses.length; i += MAX_WALLETS_PER_REQUEST) {
    const chunk = walletAddresses.slice(i, i + MAX_WALLETS_PER_REQUEST);
    await enqueueNotification({
      walletAddresses: chunk,
      title,
      message,
      miniAppPath,
      dedupKey: `tournament:${tournament.tournamentId}:${phase}:${i}`,
    });
  }
}

async function processTournament(tournament: Tournament) {
  const state = getState();
  if (!state[tournament.tournamentId]) {
    state[tournament.tournamentId] = { startNotified: false, endNotified: false };
  }

  const status = tournament.status;

  if (status === 'active' && !state[tournament.tournamentId].startNotified) {
    await notifyParticipants(tournament, 'start');
    state[tournament.tournamentId].startNotified = true;
  }

  if (status === 'finished' && !state[tournament.tournamentId].endNotified) {
    await notifyParticipants(tournament, 'end');
    state[tournament.tournamentId].endNotified = true;
  }
}

export async function runTournamentNotificationCycle() {
  const tournaments = await listTournaments();
  await Promise.all(tournaments.map((tournament) => processTournament(tournament)));
}

function startTournamentNotificationJob() {
  if (globalState.tournamentNotificationJobStarted) return;
  globalState.tournamentNotificationJobStarted = true;

  runTournamentNotificationCycle().catch((error) => {
    console.error('[tournament_notifications] Error en ciclo inicial', error);
  });

  setInterval(() => {
    runTournamentNotificationCycle().catch((error) => {
      console.error('[tournament_notifications] Error en ciclo de notificación', error);
    });
  }, JOB_INTERVAL_MS);
}

startTournamentNotificationJob();
