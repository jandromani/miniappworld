import {
  __resetMiniKitMocks,
  __setInstalled,
  __setPayResponse,
  __setSendTransactionResponse,
  __setVerifyResponse,
} from '@worldcoin/minikit-js';
import { verifyWorldID, sendTransaction } from '@/lib/miniKitClient';
import { payForTournament } from '@/lib/paymentService';

jest.mock('@worldcoin/minikit-js');

describe('Flujos Verify + Pay + Join', () => {
  beforeEach(() => {
    __resetMiniKitMocks();
    global.fetch = jest.fn();
  });

  it('ejecuta Verify, Pay y Join con mocks deterministas', async () => {
    __setVerifyResponse({
      finalPayload: {
        status: 'success',
        nullifier_hash: 'nullifier',
        proof: 'proof',
        merkle_root: 'root',
      },
    });

    __setPayResponse({
      finalPayload: {
        status: 'success',
        reference: 'ref-999',
        token: 'WLD',
        token_amount: '2000000000000000000',
      },
    });

    __setSendTransactionResponse({
      finalPayload: {
        status: 'success',
        tx_hash: '0xjoin',
      },
    });

    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    );
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, reference: 'ref-999' }) })
    );

    const verifyPayload = await verifyWorldID('trivia_game_access');
    const payment = await payForTournament('WLD', 2, 'tournament-123');
    const join = await sendTransaction({ to: '0xjoin' });

    expect(verifyPayload.status).toBe('success');
    expect(payment).toEqual({ success: true, reference: 'ref-999' });
    expect(join).toEqual(expect.objectContaining({ status: 'success', tx_hash: '0xjoin' }));
  });

  it('bloquea el flujo si la identidad no está verificada', async () => {
    __setInstalled(false);

    await expect(verifyWorldID('trivia_game_access')).rejects.toThrow(
      'MiniKit no está instalado'
    );
  });
});
