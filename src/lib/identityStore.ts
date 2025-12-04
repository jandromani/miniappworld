import { randomUUID } from 'crypto';

export type IdentityRecord = {
  userId: string;
  proof: unknown;
  merkle_root: string;
  nullifier_hash: string;
  createdAt: string;
  sessionToken: string;
};

const identitiesByNullifier = new Map<string, IdentityRecord>();
const identitiesBySession = new Map<string, IdentityRecord>();

export function createIdentityRecord({
  userId,
  proof,
  merkle_root,
  nullifier_hash,
}: {
  userId?: string;
  proof: unknown;
  merkle_root: string;
  nullifier_hash: string;
}): IdentityRecord {
  const record: IdentityRecord = {
    userId: userId ?? nullifier_hash,
    proof,
    merkle_root,
    nullifier_hash,
    createdAt: new Date().toISOString(),
    sessionToken: randomUUID(),
  };

  identitiesByNullifier.set(nullifier_hash, record);
  identitiesBySession.set(record.sessionToken, record);

  return record;
}

export function getIdentityByNullifier(nullifier_hash: string) {
  return identitiesByNullifier.get(nullifier_hash);
}

export function getIdentityBySession(sessionToken?: string | null) {
  if (!sessionToken) return undefined;
  return identitiesBySession.get(sessionToken);
}

export function clearIdentities() {
  identitiesByNullifier.clear();
  identitiesBySession.clear();
}
