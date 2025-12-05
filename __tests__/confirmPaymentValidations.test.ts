import { NextRequest } from 'next/server';
import { POST } from '@/app/api/confirm-payment/route';

jest.mock('@/lib/database', () => ({
  findWorldIdVerificationBySession: jest.fn(),
  findPaymentByReference: jest.fn(),
  recordAuditEvent: jest.fn(),
  updatePaymentStatus: jest.fn(),
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

describe('confirm-payment validations', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.APP_ID = 'app_test';
    process.env.DEV_PORTAL_API_KEY = 'dev-key';
    jest.resetAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('retorna error detallado cuando faltan campos obligatorios', async () => {
    const req = createRequest(
      {
        reference: '',
        payload: { status: 'success' },
      },
      { session_token: 'session-1' }
    );

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('INVALID_PAYLOAD');
    expect(body.details.errors).toEqual(
      expect.arrayContaining([
        'Referencia es obligatoria',
        'transaction_id es obligatorio',
        'wallet_address es obligatorio',
        'token es obligatorio',
        'amount es obligatorio',
      ])
    );
    expect(mockDatabase.findWorldIdVerificationBySession).not.toHaveBeenCalled();
  });

  it('detecta sesión inconsistente antes de confirmar', async () => {
    mockDatabase.findWorldIdVerificationBySession.mockResolvedValue({
      user_id: 'user-1',
      nullifier_hash: 'nullifier-1',
    });

    mockDatabase.findPaymentByReference.mockResolvedValue({
      reference: 'ref-1',
      status: 'pending',
      token_address: '0xabc',
      token_amount: '10',
      user_id: 'user-1',
      wallet_address: '0xabc',
      session_token: 'other-session',
      type: 'generic',
    });

    const req = createRequest(
      {
        reference: 'ref-1',
        payload: { status: 'success', transaction_id: 'tx-1', token: 'abc', token_amount: '10', wallet_address: '0xabc' },
      },
      { session_token: 'session-1' }
    );

    const response = await POST(req);
    const body = await response.json();

    expect(body.code).toBe('SESSION_INVALID');
    expect(mockDatabase.updatePaymentStatus).toHaveBeenCalled();
  });

  it('responde éxito idempotente cuando el pago ya está confirmado', async () => {
    mockDatabase.findWorldIdVerificationBySession.mockResolvedValue({
      user_id: 'user-1',
      nullifier_hash: 'nullifier-1',
    });

    mockDatabase.findPaymentByReference.mockResolvedValue({
      reference: 'ref-confirmed',
      status: 'confirmed',
      token_address: '0xabc',
      token_amount: '10',
      user_id: 'user-1',
      wallet_address: '0xabc',
      session_token: 'session-1',
      transaction_id: 'tx-99',
      type: 'generic',
    });

    const req = createRequest(
      {
        reference: 'ref-confirmed',
        payload: { status: 'success', transaction_id: 'tx-99', token: 'abc', token_amount: '10', wallet_address: '0xabc' },
      },
      { session_token: 'session-1' }
    );

    const response = await POST(req);
    const body = await response.json();

    expect(body).toEqual(
      expect.objectContaining({ success: true, message: 'Pago ya confirmado previamente', reference: 'ref-confirmed' })
    );
    expect(mockDatabase.updatePaymentStatus).not.toHaveBeenCalled();
  });
});
