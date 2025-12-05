import {
  MiniKit,
  __resetMiniKitMocks,
  __setInstalled,
  __setSendTransactionResponse,
  __setVerifyResponse,
} from '@worldcoin/minikit-js';
import { sendTransaction, verifyWorldID } from '@/lib/miniKitClient';

jest.mock('@worldcoin/minikit-js');

describe('miniKitClient', () => {
  beforeEach(() => {
    __resetMiniKitMocks();
  });

  it('debería retornar el payload de Verify cuando World ID está instalado', async () => {
    __setVerifyResponse({
      finalPayload: {
        status: 'success',
        proof: 'proof-data',
        nullifier_hash: 'nullifier',
        merkle_root: 'root',
      },
    });

    const result = await verifyWorldID('trivia_game_access');

    expect(result).toEqual(
      expect.objectContaining({ status: 'success', proof: 'proof-data' })
    );
    expect(MiniKit.isInstalled).toHaveBeenCalled();
  });

  it('debería lanzar error si World ID no está instalado', async () => {
    __setInstalled(false);

    await expect(verifyWorldID('trivia_game_access')).rejects.toThrow(
      'MiniKit no está instalado'
    );
  });

  it('debería lanzar error cuando Verify retorna status error', async () => {
    __setVerifyResponse({
      finalPayload: {
        status: 'error',
        error_code: 'user_cancelled',
      },
    });

    await expect(verifyWorldID('trivia_game_access')).rejects.toThrow(
      'Error en Verify: user_cancelled'
    );
  });

  it('debería ejecutar Send Transaction y propagar errores', async () => {
    __setSendTransactionResponse({
      finalPayload: {
        status: 'error',
        error_code: 'transaction_failed',
      },
    });

    await expect(sendTransaction({ to: '0x123' })).rejects.toThrow(
      'Error en Send Transaction: transaction_failed'
    );
  });
});
