import { NextRequest } from 'next/server';
import { MEMECOIN_CONFIG } from '@/lib/constants';
import { POST } from '@/app/api/confirm-payment/route';

jest.mock('@/lib/database', () => ({
  findWorldIdVerificationBySession: jest.fn(),
  findPaymentByReference: jest.fn(),
  recordAuditEvent: jest.fn(),
  updatePaymentStatus: jest.fn(),
}));

jest.mock('@/lib/notificationService', () => ({
  sendNotification: jest.fn(),
}));

const mockDatabase = jest.requireMock('@/lib/database');

const createRequest = (body: any, cookies: Record<string, string>) => {
  const cookieHeader = Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');

  const request = new Request('http://localhost/api/confirm-payment', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieHeader,
    },
    body: JSON.stringify(body),
  });

  return new NextRequest(request);
};

describe('confirm-payment memecoin', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.APP_ID = 'app_puf';
    process.env.DEV_PORTAL_API_KEY = 'dev-key';
    jest.resetAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('confirma pagos de memecoin usando el símbolo PUF', async () => {
    const sessionToken = 'session-123';

    mockDatabase.findWorldIdVerificationBySession.mockResolvedValue({
      user_id: 'user-1',
      nullifier_hash: 'nullifier',
    });

    mockDatabase.findPaymentByReference.mockResolvedValue({
      reference: 'ref-meme',
      status: 'pending',
      token_address: MEMECOIN_CONFIG.address,
      token_amount: '1000000000000000000',
      user_id: 'user-1',
      wallet_address: '0xabc0000000000000000000000000000000000000',
      session_token: sessionToken,
      type: 'tournament',
      tournament_id: 'puf-cup',
    });

    const transactionResponse = {
      transaction_status: 'success',
      reference: 'ref-meme',
      token: 'PUF',
      token_amount: '1000000000000000000',
      wallet_address: '0xabc0000000000000000000000000000000000000',
      tournamentId: 'puf-cup',
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(transactionResponse),
    } as Response);

    const req = createRequest(
      {
        payload: { status: 'success', transaction_id: 'tx-1' },
        reference: 'ref-meme',
      },
      { session_token: sessionToken }
    );

    const response = await POST(req);
    const body = await response.json();

    expect(body).toEqual({ success: true, message: 'Pago confirmado' });
    expect(mockDatabase.updatePaymentStatus).toHaveBeenCalledWith(
      'ref-meme',
      'confirmed',
      expect.objectContaining({ transaction_id: 'tx-1' }),
      expect.objectContaining({ userId: 'user-1', sessionId: sessionToken })
    );
  });
});
