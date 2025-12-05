import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/sessionValidation';
import { updatePlayerProfile } from '@/lib/server/playerStatsStore';

function validateAlias(alias?: string) {
  if (!alias) return true;
  const trimmed = alias.trim();
  return trimmed.length >= 3 && trimmed.length <= 32;
}

function validateAvatarUrl(url?: string) {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch (error) {
    console.warn('[player-profile] URL de avatar inválida', error);
    return false;
  }
}

export async function PATCH(req: NextRequest) {
  const sessionResult = await requireActiveSession(req, { path: 'player/profile' });

  if ('error' in sessionResult) {
    return sessionResult.error;
  }

  const { identity } = sessionResult;

  const body = await req.json();
  const { alias, avatarUrl } = body as { alias?: string; avatarUrl?: string };

  if (!alias && !avatarUrl) {
    return NextResponse.json(
      { error: 'Debes enviar alias o avatar para actualizar el perfil' },
      { status: 400 }
    );
  }

  if (!validateAlias(alias)) {
    return NextResponse.json(
      { error: 'El alias debe tener entre 3 y 32 caracteres' },
      { status: 400 }
    );
  }

  if (!validateAvatarUrl(avatarUrl)) {
    return NextResponse.json(
      { error: 'URL de avatar inválida. Usa http(s)://' },
      { status: 400 }
    );
  }

  try {
    const updated = await updatePlayerProfile(identity.user_id, { alias, avatarUrl });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('[player-profile] Error al actualizar perfil', error);
    return NextResponse.json({ error: 'No se pudo actualizar el perfil' }, { status: 500 });
  }
}
