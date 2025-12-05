import { POST } from '@/app/api/verify-world-id/route';
import { NextRequest } from 'next/server';
import { verifyCloudProof } from '@worldcoin/minikit-js';

const mockFindWorldIdVerificationByNullifier = jest.fn();
const mockFindWorldIdVerificationByUser = jest.fn();
const mockInsertWorldIdVerification = jest.fn();

jest.mock('@/lib/database', () => ({
  findWorldIdVerificationByNullifier: (...args: unknown[]) =>
    mockFindWorldIdVerificationByNullifier(...args),
  findWorldIdVerificationByUser: (...args: unknown[]) => mockFindWorldIdVerificationByUser(...args),
  insertWorldIdVerification: (...args: unknown[]) => mockInsertWorldIdVerification(...args),
}));

jest.mock('@worldcoin/minikit-js', () => ({
  verifyCloudProof: jest.fn(),
}));

describe('POST /api/verify-world-id', () => {
  const originalAppId = process.env.APP_ID;
  const mockVerifyCloudProof = verifyCloudProof as jest.Mock;

  beforeEach(() => {
    process.env.APP_ID = 'app_test';
    mockFindWorldIdVerificationByNullifier.mockReset();
    mockFindWorldIdVerificationByUser.mockReset();
    mockInsertWorldIdVerification.mockReset();
    mockVerifyCloudProof.mockReset();
  });

  afterAll(() => {
    process.env.APP_ID = originalAppId;
  });

  it('rechaza acciones no permitidas', async () => {
    const request = {
      json: jest.fn().mockResolvedValue({
        proof: 'proof',
        nullifier_hash: 'nullifier-hash',
        merkle_root: 'root',
        action: 'accion_no_permitida',
      }),
    } as unknown as NextRequest;

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual(
      expect.objectContaining({
        success: false,
        error: 'Acción de verificación no permitida',
      })
    );
    expect(mockFindWorldIdVerificationByNullifier).not.toHaveBeenCalled();
    expect(mockFindWorldIdVerificationByUser).not.toHaveBeenCalled();
    expect(mockInsertWorldIdVerification).not.toHaveBeenCalled();
  });

  it('mapea rate_limited a un mensaje claro y status 429', async () => {
    mockVerifyCloudProof.mockResolvedValue({ success: false, code: 'rate_limited', correlation_id: 'abc' });

    const request = new NextRequest('http://localhost/api/verify-world-id', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        proof: { signal: 'demo' },
        nullifier_hash: 'nullifier-123',
        merkle_root: 'root',
        wallet_address: '0xC0ffee254729296a45a3885639AC7E10F9d54979',
        user_id: 'user-123',
        action: 'trivia_game_access',
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'RATE_LIMITED',
        message: expect.stringContaining('Demasiadas verificaciones'),
      })
    );
  });

  it('mapea action_mismatch a un forbidden con detalle util', async () => {
    mockVerifyCloudProof.mockResolvedValue({
      success: false,
      code: 'action_mismatch',
      expected: 'trivia_game_access',
      received: 'other_action',
    });

    const request = new NextRequest('http://localhost/api/verify-world-id', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        proof: { signal: 'demo' },
        nullifier_hash: 'nullifier-456',
        merkle_root: 'root',
        wallet_address: '0xC0ffee254729296a45a3885639AC7E10F9d54979',
        user_id: 'user-456',
        action: 'trivia_game_access',
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'FORBIDDEN',
        message: expect.stringContaining('La prueba no corresponde a la acción solicitada'),
      })
    );
  });
});
