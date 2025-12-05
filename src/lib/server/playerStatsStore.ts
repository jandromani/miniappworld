import fs from 'fs/promises';
import path from 'path';
import { findWorldIdVerificationByUser } from '../database';

export type PlayerStats = {
  userId: string;
  walletAddress: string;
  username: string;
  alias?: string;
  avatarUrl?: string;
  totalGamesPlayed: number;
  totalWins: number;
  totalLosses: number;
  highestScore: number;
  averageScore: number;
  tournamentsWon: number;
  totalEarnings: string;
  lastPlayedAt: string;
};

type PlayerStatsStore = {
  players: PlayerStats[];
};

const PLAYER_STATS_PATH = path.join(process.cwd(), 'data', 'player-stats.json');

async function ensureStore(): Promise<PlayerStatsStore> {
  try {
    const content = await fs.readFile(PLAYER_STATS_PATH, 'utf8');
    const parsed = JSON.parse(content) as PlayerStats[];
    return { players: parsed };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      await fs.mkdir(path.dirname(PLAYER_STATS_PATH), { recursive: true });
      await fs.writeFile(PLAYER_STATS_PATH, '[]', 'utf8');
      return { players: [] };
    }

    console.error('[player-stats] Error al leer store', error);
    throw new Error('No se pudo cargar el store de player stats');
  }
}

async function saveStore(store: PlayerStatsStore) {
  await fs.writeFile(PLAYER_STATS_PATH, JSON.stringify(store.players, null, 2), 'utf8');
}

function buildDefaultAvatar(userId: string) {
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(userId)}`;
}

function buildDefaultAlias(userId: string, username?: string) {
  if (username && username.trim().length > 0) return username;
  return `Jugador-${userId.slice(0, 6)}`;
}

export async function getPlayerStats(userId: string): Promise<PlayerStats> {
  const store = await ensureStore();
  const existing = store.players.find((player) => player.userId === userId);

  if (existing) {
    return existing;
  }

  const identity = await findWorldIdVerificationByUser(userId);
  const nowIso = new Date().toISOString();
  const username = identity?.user_id ?? userId;
  const defaultEntry: PlayerStats = {
    userId,
    walletAddress: identity?.wallet_address ?? 'Wallet no vinculada',
    username,
    alias: buildDefaultAlias(userId, username),
    avatarUrl: buildDefaultAvatar(userId),
    totalGamesPlayed: 0,
    totalWins: 0,
    totalLosses: 0,
    highestScore: 0,
    averageScore: 0,
    tournamentsWon: 0,
    totalEarnings: '0',
    lastPlayedAt: nowIso,
  };

  store.players.push(defaultEntry);
  await saveStore(store);

  return defaultEntry;
}

export async function updatePlayerProfile(
  userId: string,
  updates: { alias?: string; avatarUrl?: string }
): Promise<PlayerStats> {
  const store = await ensureStore();
  const playerIndex = store.players.findIndex((player) => player.userId === userId);

  if (playerIndex === -1) {
    await getPlayerStats(userId);
    return updatePlayerProfile(userId, updates);
  }

  const player = store.players[playerIndex];

  const sanitizedAlias = updates.alias?.trim();
  const sanitizedAvatar = updates.avatarUrl?.trim();

  if (sanitizedAlias) {
    player.alias = sanitizedAlias;
    if (!player.username || player.username === player.userId) {
      player.username = sanitizedAlias;
    }
  }

  if (sanitizedAvatar) {
    player.avatarUrl = sanitizedAvatar;
  }

  store.players[playerIndex] = { ...player, lastPlayedAt: new Date().toISOString() };
  await saveStore(store);

  return store.players[playerIndex];
}
