import { NextRequest, NextResponse } from 'next/server';
import { findWorldIdVerificationBySession } from '@/lib/database';
import { validateCsrf } from '@/lib/security';
import { updatePlayerProfile } from '@/lib/server/playerStatsStore';
import { validateHttpUrl, validateUserText } from '@/lib/validation';

const SESSION_COOKIE = 'session_token';

export async function PATCH(req: NextRequest) {
  const csrfCheck = validateCsrf(req);
  if (!csrfCheck.valid) {
    return NextResponse.json({ error: 'CSRF inválido' }, { status: 403 });
  }

  const session = req.cookies.get(SESSION_COOKIE);

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

  let sanitizedAlias: string | undefined;
  if (alias !== undefined) {
    const aliasValidation = validateUserText(alias, { field: 'El alias', min: 3, max: 32 });
    if (!aliasValidation.valid) {
      return NextResponse.json({ error: aliasValidation.error }, { status: 400 });
    }
    sanitizedAlias = aliasValidation.sanitized;
  }

  let sanitizedAvatar: string | undefined;
  if (avatarUrl !== undefined) {
    const avatarValidation = validateHttpUrl(avatarUrl);
    if (!avatarValidation.valid) {
      return NextResponse.json({ error: avatarValidation.error }, { status: 400 });
    }
    sanitizedAvatar = avatarValidation.sanitized;
  }

  try {
    const updated = await updatePlayerProfile(identity.user_id, {
      alias: sanitizedAlias,
      avatarUrl: sanitizedAvatar,
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('[player-profile] Error al actualizar perfil', error);
    return NextResponse.json({ error: 'No se pudo actualizar el perfil' }, { status: 500 });
  }
}
