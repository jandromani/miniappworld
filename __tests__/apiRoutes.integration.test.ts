import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { NextRequest } from 'next/server';
import { SUPPORTED_TOKENS } from '@/lib/constants';

function buildNextRequest(
  url: string,
  body: Record<string, unknown>,
  options: { cookies?: Record<string, string>; headers?: Record<string, string> } = {}
) {
  const headers = new Headers({
    'content-type': 'application/json',
    ...options.headers,
  });

  if (options.cookies) {
    const cookieHeader = Object.entries(options.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    headers.set('cookie', cookieHeader);
  }

  return new NextRequest(
    new Request(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  );
}

describe('API real flow with HTTP mocks', () => {
  const sessionToken = 'session-xyz';
  const userId = 'user-123';
  const walletAddress = '0x1234abcd';
  const reference = 'ref-api-001';
  const tournamentId = 'daily-wld';

  beforeEach(async () => {
    jest.resetModules();
    await fs.rm(path.join(process.cwd(), 'data'), { recursive: true, force: true });
    process.env.APP_ID = 'app_test';
    process.env.DEV_PORTAL_API_KEY = 'test_key';
    process.env.NEXT_PUBLIC_RECEIVER_ADDRESS = '0xreceiver';
  });

  it('crea pago, confirma y registra participante usando las APIs', async () => {
    const { insertWorldIdVerification, findPaymentByReference } = await import('@/lib/database');
    const { participantExists } = await import('@/lib/server/tournamentData');
    const { POST: initiatePayment } = await import('@/app/api/initiate-payment/route');
    const { POST: confirmPayment } = await import('@/app/api/confirm-payment/route');
    const { POST: joinTournament } = await import('@/app/api/tournaments/[tournamentId]/join/route');

    await insertWorldIdVerification({
      nullifier_hash: 'nullifier-hash',
      wallet_address: walletAddress,
      action: 'verify',
      user_id: userId,
      session_token: sessionToken,
      verification_level: 'orb',
      merkle_root: 'root',
    });

    const initiateRequest = buildNextRequest(
      'http://localhost/api/initiate-payment',
      {
        reference,
        type: 'tournament',
        token: SUPPORTED_TOKENS.WLD.address,
        amount: 1,
        tournamentId,
        walletAddress,
        userId,
      },
      { cookies: { session_token: sessionToken } }
    );

    const initiateResponse = await initiatePayment(initiateRequest);
    await expect(initiateResponse.json()).resolves.toEqual({
      success: true,
      reference,
      tournamentId,
    });

    const createdPayment = await findPaymentByReference(reference);
    expect(createdPayment?.status).toBe('pending');

    const fetchMock = jest.fn(async (url: RequestInfo | URL) => {
      const asString = url.toString();

      if (asString.includes('/transaction/')) {
        return {
          ok: true,
          json: async () => ({
            transaction_status: 'confirmed',
            reference,
            token: SUPPORTED_TOKENS.WLD.address,
            amount: createdPayment?.token_amount,
            wallet_address: walletAddress,
            tournament_id: tournamentId,
          }),
        } as Response;
      }

      if (asString.includes('send-notification')) {
        return {
          ok: true,
          json: async () => ({}),
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${asString}`);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const confirmRequest = buildNextRequest(
      'http://localhost/api/confirm-payment',
      {
        reference,
        payload: {
          status: 'success',
          token: SUPPORTED_TOKENS.WLD.symbol,
          token_amount: createdPayment?.token_amount,
          transaction_id: 'tx-123',
          wallet_address: walletAddress,
        },
      },
      { cookies: { session_token: sessionToken } }
    );

    const confirmResponse = await confirmPayment(confirmRequest);
    await expect(confirmResponse.json()).resolves.toEqual({
      success: true,
      message: 'Pago confirmado',
    });

    const confirmedPayment = await findPaymentByReference(reference);
    expect(confirmedPayment?.status).toBe('confirmed');

    const joinRequest = buildNextRequest(
      `http://localhost/api/tournaments/${tournamentId}/join`,
      {
        token: SUPPORTED_TOKENS.WLD.address,
        amount: confirmedPayment?.token_amount ?? '0',
        userId,
        username: 'Tester',
        walletAddress,
        score: 0,
        paymentReference: reference,
      },
      { cookies: { session_token: sessionToken } }
    );

    const joinResponse = await joinTournament(joinRequest, { params: { tournamentId } });
    const joinPayload = await joinResponse.json();

    expect(joinPayload).toEqual(
      expect.objectContaining({ success: true, tournament: expect.objectContaining({ tournamentId }) })
    );

    await expect(participantExists(tournamentId, userId)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/transaction/tx-123'),
      expect.objectContaining({ method: 'GET' })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://developer.worldcoin.org/api/v2/minikit/send-notification',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
