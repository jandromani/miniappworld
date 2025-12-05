import { POST } from '@/app/api/verify-world-id/route';
import { NextRequest } from 'next/server';

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

  beforeEach(() => {
    process.env.APP_ID = 'app_test';
    mockFindWorldIdVerificationByNullifier.mockReset();
    mockFindWorldIdVerificationByUser.mockReset();
    mockInsertWorldIdVerification.mockReset();
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
});
