import { POST as initiatePayment } from '@/app/api/initiate-payment/route';
import { POST as joinTournament } from '@/app/api/tournaments/[tournamentId]/join/route';
import {
  findPaymentByReference,
  findWorldIdVerificationBySession,
  findWorldIdVerificationByUser,
} from '@/lib/database';
import {
  getTournament,
  incrementTournamentPool,
  participantExists,
  serializeTournament,
  validateTokenForTournament,
} from '@/lib/server/tournamentData';

jest.mock('@/lib/database', () => ({
  findPaymentByReference: jest.fn(),
  findWorldIdVerificationBySession: jest.fn(),
  findWorldIdVerificationByUser: jest.fn(),
}));

jest.mock('@/lib/server/tournamentData', () => ({
  getTournament: jest.fn(),
  incrementTournamentPool: jest.fn(),
  participantExists: jest.fn(),
  serializeTournament: jest.fn(),
  validateTokenForTournament: jest.fn(),
}));

jest.mock('@/lib/notificationService', () => ({
  sendNotification: jest.fn(),
}));

type RequestOptions = {
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
};

function createRequest(body: any, options: RequestOptions = {}) {
  const headers = new Headers(options.headers);
  const cookies = {
    get: (name: string) => {
      const value = options.cookies?.[name];
      return value ? { value } : undefined;
    },
  };

  return {
    headers,
    cookies,
    json: jest.fn().mockResolvedValue(body),
  } as any;
}

describe('initiate-payment route', () => {
  const findSession = findWorldIdVerificationBySession as jest.MockedFunction<
    typeof findWorldIdVerificationBySession
  >;
  const findReference = findPaymentByReference as jest.MockedFunction<
    typeof findPaymentByReference
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rechaza referencias duplicadas de otro usuario', async () => {
    findSession.mockResolvedValue({ user_id: 'user-2', wallet_address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' } as any);
    findReference.mockResolvedValue({
      reference: 'dup-ref',
      user_id: 'user-1',
      wallet_address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    } as any);

    const req = createRequest(
      { reference: 'dup-ref', type: 'quick_match' },
      { cookies: { session_token: 'session-123' } }
    );

    const response = await initiatePayment(req);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toContain('referencia ya fue utilizada');
  });

  it('devuelve 401 cuando la sesión no es válida', async () => {
    findSession.mockResolvedValue(undefined as any);
    findReference.mockResolvedValue(undefined);

    const req = createRequest(
      { reference: 'sessionless', type: 'quick_match' },
      { cookies: { session_token: 'expired-session' } }
    );

    const response = await initiatePayment(req);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.message).toBe('Sesión inválida o expirada. Vuelve a verificar tu identidad.');
  });
});

describe('tournament join route', () => {
  const getTournamentMock = getTournament as jest.MockedFunction<typeof getTournament>;
  const participantExistsMock = participantExists as jest.MockedFunction<typeof participantExists>;
  const findSession = findWorldIdVerificationBySession as jest.MockedFunction<
    typeof findWorldIdVerificationBySession
  >;
  const findByUser = findWorldIdVerificationByUser as jest.MockedFunction<
    typeof findWorldIdVerificationByUser
  >;
  const findReference = findPaymentByReference as jest.MockedFunction<
    typeof findPaymentByReference
  >;
  const validateToken = validateTokenForTournament as jest.MockedFunction<
    typeof validateTokenForTournament
  >;
  const incrementPool = incrementTournamentPool as jest.MockedFunction<typeof incrementTournamentPool>;
  const serialize = serializeTournament as jest.MockedFunction<typeof serializeTournament>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('responde con error cuando el token no está soportado', async () => {
    getTournamentMock.mockResolvedValue({
      tournamentId: 'tour-1',
      status: 'upcoming',
      currentPlayers: 0,
      maxPlayers: 10,
      entryFee: 1,
      acceptedTokens: ['WLD'],
    } as any);
    participantExistsMock.mockResolvedValue(false);
    findSession.mockResolvedValue({
      user_id: 'user-1',
      nullifier_hash: 'hash',
      wallet_address: '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD',
    } as any);
    findByUser.mockResolvedValue({
      user_id: 'user-1',
      nullifier_hash: 'hash',
      wallet_address: '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD',
    } as any);
    findReference.mockResolvedValue({
      reference: 'pay-ref',
      status: 'confirmed',
      tournament_id: 'tour-1',
      session_token: 'session-1',
      user_id: 'user-1',
      nullifier_hash: 'hash',
      wallet_address: '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD',
      token_amount: '1000000000000000000',
      token_address: '0x2222222222222222222222222222222222222222',
    } as any);
    validateToken.mockReturnValue({ valid: true, message: '' });
    incrementPool.mockResolvedValue({ tournamentId: 'tour-1' } as any);
    serialize.mockResolvedValue({ tournamentId: 'tour-1' } as any);

    const req = createRequest(
      {
        token: '0x0000000000000000000000000000000000000001',
        amount: 1,
        paymentReference: 'pay-ref',
        walletAddress: '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD',
        username: 'Player',
      },
      { cookies: { session_token: 'session-1' } }
    );

    const response = await joinTournament(req, { params: { tournamentId: 'tour-1' } });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Token no soportado');
  });
});

describe('send-notification route', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.NOTIFICATIONS_API_KEY = 'secret-key';
    process.env.DEV_PORTAL_API_KEY = 'dev-key';
    process.env.APP_ID = 'app-id';
    (global.fetch as any) = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
  });

  it('aplica rate limit después de 10 solicitudes con la misma API key', async () => {
    const { POST } = await import('@/app/api/send-notification/route');

    const body = {
      walletAddresses: ['0x1111111111111111111111111111111111111111'],
      title: 'Hola',
      message: 'Test',
      miniAppPath: '/demo',
    };

    for (let i = 0; i < 10; i++) {
      const req = createRequest(body, { headers: { 'x-api-key': 'secret-key' } });
      const response = await POST(req as any);
      expect(response.status).toBe(200);
    }

    const limitedReq = createRequest(body, { headers: { 'x-api-key': 'secret-key' } });
    const limitedResponse = await POST(limitedReq as any);
    const limitedBody = await limitedResponse.json();

    expect(limitedResponse.status).toBe(429);
    expect(limitedBody.message).toContain('Límite de solicitudes');
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(10);
  });
});
