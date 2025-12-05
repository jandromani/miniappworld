import { GET as exportData, DELETE as deleteData } from '@/app/api/player/data/route';
import { GET as getPrivacy, POST as postPrivacy } from '@/app/api/player/privacy/route';
import {
  deleteUserDataset,
  exportUserDataset,
  findUserConsent,
  findWorldIdVerificationBySession,
  upsertUserConsent,
} from '@/lib/database';
import { deletePlayerStats, exportPlayerProfile } from '@/lib/server/playerStatsStore';

jest.mock('@/lib/database', () => ({
  findWorldIdVerificationBySession: jest.fn(),
  exportUserDataset: jest.fn(),
  deleteUserDataset: jest.fn(),
  findUserConsent: jest.fn(),
  upsertUserConsent: jest.fn(),
}));

jest.mock('@/lib/server/playerStatsStore', () => ({
  exportPlayerProfile: jest.fn(),
  deletePlayerStats: jest.fn(),
}));

type RequestOptions = { body?: any; cookies?: Record<string, string> };

function createRequest(options: RequestOptions = {}) {
  const cookies = {
    get: (name: string) => {
      const value = options.cookies?.[name];
      return value ? { value } : undefined;
    },
  };

  return {
    cookies,
    json: jest.fn().mockResolvedValue(options.body),
  } as any;
}

describe('privacy routes', () => {
  const findSession = findWorldIdVerificationBySession as jest.MockedFunction<
    typeof findWorldIdVerificationBySession
  >;
  const exportDataset = exportUserDataset as jest.MockedFunction<typeof exportUserDataset>;
  const exportProfile = exportPlayerProfile as jest.MockedFunction<typeof exportPlayerProfile>;
  const deleteDataset = deleteUserDataset as jest.MockedFunction<typeof deleteUserDataset>;
  const deleteStats = deletePlayerStats as jest.MockedFunction<typeof deletePlayerStats>;
  const findConsent = findUserConsent as jest.MockedFunction<typeof findUserConsent>;
  const saveConsent = upsertUserConsent as jest.MockedFunction<typeof upsertUserConsent>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rechaza exportar datos sin sesión', async () => {
    const response = await exportData(createRequest());
    expect(response.status).toBe(401);
  });

  it('exporta datos y perfil cuando la sesión es válida', async () => {
    findSession.mockResolvedValue({ user_id: 'user-123' } as any);
    exportDataset.mockResolvedValue({ payments: [], gameProgress: [], consent: null } as any);
    exportProfile.mockResolvedValue({ userId: 'user-123', username: 'Player' } as any);

    const response = await exportData(createRequest({ cookies: { session_token: 'abc' } }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.profile.userId).toBe('user-123');
    expect(exportDataset).toHaveBeenCalledWith('user-123');
  });

  it('borra datos y stats del usuario', async () => {
    findSession.mockResolvedValue({ user_id: 'user-erase' } as any);
    deleteDataset.mockResolvedValue({ removed: { payments: 1 } } as any);
    deleteStats.mockResolvedValue({ removed: 1 } as any);

    const response = await deleteData(createRequest({ cookies: { session_token: 'erase-token' } }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.removed.playerStats).toBe(1);
    expect(deleteDataset).toHaveBeenCalledWith('user-erase', {
      sessionId: 'erase-token',
      userId: 'user-erase',
    });
  });

  it('devuelve consentimiento guardado', async () => {
    findSession.mockResolvedValue({ user_id: 'user-privacy' } as any);
    findConsent.mockResolvedValue({ user_id_processing: true, wallet_processing: true } as any);

    const response = await getPrivacy(createRequest({ cookies: { session_token: 'token' } }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.consent.user_id_processing).toBe(true);
  });

  it('exige aceptar la política al guardar consentimiento', async () => {
    findSession.mockResolvedValue({ user_id: 'user-privacy' } as any);

    const response = await postPrivacy(
      createRequest({
        cookies: { session_token: 'token' },
        body: { walletProcessing: true, userIdProcessing: true, acceptPolicies: false },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/Debes aceptar/);
    expect(saveConsent).not.toHaveBeenCalled();
  });
});
