import { NextRequest, NextResponse } from 'next/server';
import { verifyCloudProof } from '@worldcoin/minikit-js';
import { createIdentityRecord, getIdentityByNullifier } from '@/lib/identityStore';

const SESSION_COOKIE = 'session_token';

export async function POST(req: NextRequest) {
  try {
    const { proof, nullifier_hash, merkle_root } = await req.json();

    if (!proof || !nullifier_hash || !merkle_root) {
      console.warn('[verify-world-id] Solicitud inválida', { nullifier_hash });
      return NextResponse.json(
        {
          success: false,
          error: 'Faltan parámetros obligatorios (proof, nullifier_hash, merkle_root)',
        },
        { status: 400 }
      );
    }

    if (!process.env.APP_ID) {
      console.error('[verify-world-id] Configuración faltante: APP_ID no definido');
      return NextResponse.json(
        { success: false, error: 'Configuración del servidor incompleta' },
        { status: 500 }
      );
    }

    const incomingSession = req.cookies.get(SESSION_COOKIE)?.value;
    const existingIdentity = getIdentityByNullifier(nullifier_hash);

    if (existingIdentity && existingIdentity.sessionToken !== incomingSession) {
      console.warn('[verify-world-id] nullifier_hash ya registrado', {
        nullifier_hash,
        existingSession: existingIdentity.sessionToken,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'nullifier_hash ya está asociado a otra sesión',
        },
        { status: 409 }
      );
    }

    const verifyRes = await verifyCloudProof(
      { proof, nullifier_hash, merkle_root, verification_level: 'orb' },
      process.env.APP_ID as `app_${string}`,
      'trivia_game_access'
    );

    if (!verifyRes.success) {
      console.error('[verify-world-id] Verificación fallida', verifyRes);
      return NextResponse.json(
        {
          success: false,
          error: 'No se pudo verificar la prueba de World ID',
        },
        { status: 400 }
      );
    }

    const identityRecord =
      existingIdentity ??
      createIdentityRecord({
        proof,
        merkle_root,
        nullifier_hash,
        userId: nullifier_hash,
      });

    const sessionToken = identityRecord.sessionToken;
    const response = NextResponse.json({
      success: true,
      userId: identityRecord.userId,
      nullifier_hash: identityRecord.nullifier_hash,
      createdAt: identityRecord.createdAt,
    });

    response.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    console.info('[verify-world-id] Verificación exitosa', {
      userId: identityRecord.userId,
      sessionToken,
    });

    return response;
  } catch (error) {
    console.error('[verify-world-id] Error inesperado', error);
    return NextResponse.json(
      { success: false, error: 'Error interno al verificar World ID' },
      { status: 500 }
    );
  }
}
