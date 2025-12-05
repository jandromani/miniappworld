import { payForQuickMatch, payForTournament } from '@/lib/paymentService';
import { MEMECOIN_CONFIG, SUPPORTED_TOKENS } from '@/lib/constants';
import { payWithMiniKit } from '@/lib/miniKitClient';

jest.mock('@/lib/miniKitClient', () => ({
  payWithMiniKit: jest.fn(),
}));

const payWithMiniKitMock = payWithMiniKit as jest.MockedFunction<typeof payWithMiniKit>;

const createFetchResponse = (body: any, ok = true) =>
  Promise.resolve({
    ok,
    json: () => Promise.resolve(body),
  } as Response);

describe('paymentService', () => {
  beforeEach(() => {
    payWithMiniKitMock.mockReset();
    global.fetch = jest.fn();
  });

  it('paga partida rápida y valida confirmación en backend', async () => {
    payWithMiniKitMock.mockResolvedValue({
      status: 'success',
      reference: 'ref-123',
      token: SUPPORTED_TOKENS.WLD.symbol,
      token_amount: '1000000000000000000',
    } as any);

    (global.fetch as jest.Mock).mockImplementationOnce(() => createFetchResponse({}));
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      createFetchResponse({ success: true, reference: 'ref-123', transactionId: 'tx-1' })
    );

    await expect(payForQuickMatch()).resolves.toEqual({ success: true, reference: 'ref-123', transactionId: 'tx-1' });

    expect(payWithMiniKitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: [expect.objectContaining({ token_amount: '1000000000000000000' })],
        to: expect.any(String),
      })
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('lanza mensajes de error de Pay mapeados por código', async () => {
    payWithMiniKitMock.mockResolvedValue({
      status: 'error',
      error_code: 'payment_rejected',
    } as any);

    (global.fetch as jest.Mock).mockImplementationOnce(() => createFetchResponse({}));

    await expect(payForQuickMatch()).rejects.toThrow('Pago cancelado');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('paga torneo con MEMECOIN convirtiendo montos y referencia', async () => {
    payWithMiniKitMock.mockResolvedValue({
      status: 'success',
      reference: 'ref-456',
      token: MEMECOIN_CONFIG.address,
      token_amount: '5000000000000000000',
    } as any);

    (global.fetch as jest.Mock).mockImplementationOnce(() => createFetchResponse({}));
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      createFetchResponse({ success: true, reference: 'ref-456', transactionId: 'tx-2' })
    );

    await payForTournament('MEMECOIN', 5, 'demo-tournament');

    expect(payWithMiniKitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: expect.any(String),
        tokens: [
          expect.objectContaining({
            symbol: MEMECOIN_CONFIG.address,
            token_amount: '5000000000000000000',
          }),
        ],
        to: expect.any(String),
      })
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('propaga errores de confirmación del backend', async () => {
    payWithMiniKitMock.mockResolvedValue({
      status: 'success',
      reference: 'ref-789',
      token: SUPPORTED_TOKENS.WLD.symbol,
      token_amount: '1000000000000000000',
    } as any);

    (global.fetch as jest.Mock).mockImplementationOnce(() => createFetchResponse({}));
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      createFetchResponse({ success: false, message: 'Pago no verificado' }, false)
    );

    await expect(payForQuickMatch()).rejects.toThrow('Pago no verificado');
  });
});
