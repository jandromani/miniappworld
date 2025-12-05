import { NextRequest, NextResponse } from 'next/server';
import { distributePrizesOnChain } from '@/lib/server/tournamentContract';
import { getLeaderboardEntries, getTournament } from '@/lib/server/tournamentData';
import { findWalletByUserId, recordTournamentPayouts } from '@/lib/database';

const JOB_SECRET = process.env.JOB_SECRET_TOKEN;

function isAuthorized(req: NextRequest) {
  const token = req.headers.get('x-job-token');
  return JOB_SECRET && token === JOB_SECRET;
}

export async function POST(req: NextRequest, { params }: { params: { tournamentId: string } }) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, message: 'No autorizado' }, { status: 401 });
  }

  const { tournamentId } = params;

  try {
    const tournament = await getTournament(tournamentId);

    if (!tournament) {
      return NextResponse.json({ success: false, message: 'Torneo no encontrado' }, { status: 404 });
    }

    if (tournament.status !== 'finished') {
      return NextResponse.json(
        { success: false, message: 'El torneo debe estar finalizado antes de distribuir premios' },
        { status: 400 }
      );
    }

    const leaderboard = await getLeaderboardEntries(
      tournamentId,
      tournament.prizePool,
      tournament.prizeDistribution
    );

    const winners = leaderboard
      .slice(0, tournament.prizeDistribution.length)
      .filter((entry) => entry.prize && BigInt(entry.prize) > 0n);

    if (!winners.length) {
      return NextResponse.json(
        { success: false, message: 'No hay ganadores registrados para este torneo' },
        { status: 400 }
      );
    }

    const transactionHash = await distributePrizesOnChain(tournamentId);

    const payouts = await Promise.all(
      winners.map(async (winner) => ({
        tournament_id: tournamentId,
        user_id: winner.userId,
        wallet_address: (await findWalletByUserId(winner.userId)) ?? winner.walletAddress,
        prize_amount: winner.prize ?? '0',
        token_address: tournament.buyInToken,
        transaction_hash: transactionHash,
      }))
    );

    await recordTournamentPayouts(payouts);

    return NextResponse.json({
      success: true,
      transactionHash,
      payouts: payouts.map((payout) => ({
        userId: payout.user_id,
        walletAddress: payout.wallet_address,
        prizeAmount: payout.prize_amount,
      })),
    });
  } catch (error) {
    console.error('[distribute-prizes]', error);
    return NextResponse.json(
      { success: false, message: 'No se pudieron distribuir los premios' },
      { status: 500 }
    );
  }
}
