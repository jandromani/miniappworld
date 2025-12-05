import { NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

import { POST as verifyWorldIdHandler } from '@/app/api/verify-world-id/route';
import { POST as initiatePaymentHandler } from '@/app/api/initiate-payment/route';
import { POST as confirmPaymentHandler } from '@/app/api/confirm-payment/route';
import { POST as joinTournamentHandler } from '@/app/api/tournaments/[tournamentId]/join/route';
import { GET as leaderboardHandler } from '@/app/api/tournaments/[tournamentId]/leaderboard/route';
import { __setVerifyCloudProofResponse } from '@worldcoin/minikit-js';

jest.mock('@worldcoin/minikit-js');

const DATA_DIR = path.join(process.cwd(), 'data');

async function resetTestData() {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
}

async function runFullPaymentFlow(reference: string, tournamentId = `t-${reference}`) {
  __setVerifyCloudProofResponse({ success: true });

  const walletAddress = '0xC0ffee254729296a45a3885639AC7E10F9d54979';
  const tokenAmount = '2000000000000000000';

  const verifyResponse = await verifyWorldIdHandler(
    new NextRequest('http://localhost/api/verify-world-id', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        proof: { signal: 'demo' },
        nullifier_hash: `nullifier-${reference}`,
        merkle_root: 'root-123',
        wallet_address: walletAddress,
        user_id: `user-${reference}`,
        action: 'trivia_game_access',
      }),
    })
  );

  const sessionCookie = verifyResponse.cookies.get('session_token')?.value;
  expect(sessionCookie).toBeDefined();

  const initiateResponse = await initiatePaymentHandler(
    new NextRequest('http://localhost/api/initiate-payment', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `session_token=${sessionCookie}`,
      },
      body: JSON.stringify({
        reference,
        type: 'tournament',
        token: 'WLD',
        amount: 2,
        tournamentId,
        walletAddress,
      }),
    })
  );

  const initiationBody = await initiateResponse.json();
  expect(initiationBody).toEqual({ success: true, reference, tournamentId });

  const developerPortalPayload = {
    transaction_status: 'success',
    reference,
    token: 'WLD',
    amount: tokenAmount,
    wallet_address: walletAddress,
    tournament_id: tournamentId,
  };

  global.fetch = jest.fn(async (url: RequestInfo | URL) => {
    const target = url.toString();
    if (target.includes('/minikit/transaction/')) {
      return new Response(JSON.stringify(developerPortalPayload), { status: 200 });
    }

    if (target.includes('/send-notification')) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    return new Response('Not Found', { status: 404 });
  }) as unknown as typeof fetch;

  const confirmResponse = await confirmPaymentHandler(
    new NextRequest('http://localhost/api/confirm-payment', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `session_token=${sessionCookie}`,
      },
      body: JSON.stringify({
        payload: {
          status: 'success',
          transaction_id: `tx-${reference}`,
          token: 'WLD',
          token_amount: tokenAmount,
          wallet_address: walletAddress,
        },
        reference,
      }),
    })
  );

  const confirmationBody = await confirmResponse.json();
  expect(confirmationBody).toEqual({ success: true, message: 'Pago confirmado' });

  const dbContent = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'database.json'), 'utf8')) as {
    payments: any[];
    payment_status_history: any[];
    world_id_verifications: any[];
  };

  return { dbContent, walletAddress, tokenAmount, sessionCookie, tournamentId, reference };
}

describe('Flujo E2E con base JSON y Developer Portal mock', () => {
  beforeAll(() => {
    process.env.APP_ID = 'app_test';
    process.env.DEV_PORTAL_API_KEY = 'dev_portal_key';
    process.env.NEXT_PUBLIC_RECEIVER_ADDRESS = '0xReceiver';
  });

  beforeEach(async () => {
    await resetTestData();
  });

  afterAll(async () => {
    await resetTestData();
  });

  it('completa verify -> initiate -> confirm y persiste el estado en la base JSON', async () => {
    const reference = 'ref-e2e-1';
    const { dbContent, walletAddress, tokenAmount, tournamentId } = await runFullPaymentFlow(reference);

    expect(dbContent.world_id_verifications).toHaveLength(1);
    expect(dbContent.payments).toHaveLength(1);

    const paymentRecord = dbContent.payments[0];
    expect(paymentRecord).toEqual(
      expect.objectContaining({
        reference,
        status: 'confirmed',
        tournament_id: tournamentId,
        token_amount: tokenAmount,
        wallet_address: walletAddress,
      })
    );

    const historyStatuses = dbContent.payment_status_history.map((entry) => entry.new_status);
    expect(historyStatuses).toEqual(expect.arrayContaining(['pending', 'confirmed']));
  });

  it('reinicia la base JSON y no arrastra datos de pagos previos', async () => {
    const firstRun = await runFullPaymentFlow('ref-e2e-2');
    expect(firstRun.dbContent.payments).toHaveLength(1);

    await resetTestData();

    const secondRun = await runFullPaymentFlow('ref-e2e-3');
    expect(secondRun.dbContent.payments).toHaveLength(1);
    expect(secondRun.dbContent.payments[0].reference).toBe('ref-e2e-3');
  });

  it('recorre verify -> pago -> join -> leaderboard en escenario exitoso', async () => {
    const flow = await runFullPaymentFlow('ref-e2e-join', 'daily-wld');

    const joinResponse = await joinTournamentHandler(
      new NextRequest('http://localhost/api/tournaments/daily-wld/join', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `session_token=${flow.sessionCookie}`,
        },
        body: JSON.stringify({
          token: 'WLD',
          amount: flow.tokenAmount,
          userId: 'user-ref-e2e-join',
          username: 'Player E2E',
          walletAddress: flow.walletAddress,
          score: 10,
          paymentReference: flow.reference,
        }),
      }),
      { params: { tournamentId: flow.tournamentId } }
    );

    const joinPayload = await joinResponse.json();
    expect(joinResponse.status).toBe(200);
    expect(joinPayload).toEqual(
      expect.objectContaining({ success: true, tournament: expect.objectContaining({ tournamentId: flow.tournamentId }) })
    );

    const leaderboardResponse = await leaderboardHandler(
      new NextRequest(`http://localhost/api/tournaments/${flow.tournamentId}/leaderboard`, { method: 'GET' }),
      { params: { tournamentId: flow.tournamentId } }
    );

    const leaderboard = (await leaderboardResponse.json()) as Array<{ userId: string; score: number }>;
    const playerEntry = leaderboard.find((entry) => entry.userId === 'user-ref-e2e-join');

    expect(playerEntry).toBeDefined();
    expect(playerEntry?.score).toBe(10);
  });

  it('bloquea join sin sesión y mantiene leaderboard sin cambios', async () => {
    const flow = await runFullPaymentFlow('ref-e2e-join-error', 'daily-wld');

    const leaderboardBefore = await leaderboardHandler(
      new NextRequest(`http://localhost/api/tournaments/${flow.tournamentId}/leaderboard`, { method: 'GET' }),
      { params: { tournamentId: flow.tournamentId } }
    );

    const baseline = (await leaderboardBefore.json()) as Array<{ userId: string }>;

    const joinResponse = await joinTournamentHandler(
      new NextRequest('http://localhost/api/tournaments/daily-wld/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: 'WLD',
          amount: flow.tokenAmount,
          userId: 'user-ref-e2e-join-error',
          username: 'Player Blocked',
          walletAddress: flow.walletAddress,
          score: 5,
          paymentReference: flow.reference,
        }),
      }),
      { params: { tournamentId: flow.tournamentId } }
    );

    const errorPayload = await joinResponse.json();
    expect(joinResponse.status).toBe(401);
    expect(errorPayload).toEqual(expect.objectContaining({ error: expect.stringContaining('sesión') }));

    const leaderboardAfter = await leaderboardHandler(
      new NextRequest(`http://localhost/api/tournaments/${flow.tournamentId}/leaderboard`, { method: 'GET' }),
      { params: { tournamentId: flow.tournamentId } }
    );

    const finalEntries = (await leaderboardAfter.json()) as Array<{ userId: string }>;
    expect(finalEntries).toEqual(baseline);
  });
});
