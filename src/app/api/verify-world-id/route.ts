import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { verifyCloudProof } from '@worldcoin/minikit-js';
import {
  findWorldIdVerificationByNullifier,
  findWorldIdVerificationByUser,
  insertWorldIdVerification,
  isLocalStorageDisabled,
} from '@/lib/database';

const SESSION_COOKIE = 'session_token';

export async function POST(req: NextRequest) {
  try {
    const { proof, nullifier_hash, merkle_root, wallet_address, user_id, action, verification_level } =
      await req.json();

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

    if (wallet_address && !/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
      console.warn('[verify-world-id] Dirección de wallet inválida', { wallet_address });
      return NextResponse.json(
        {
          success: false,
          error: 'wallet_address no tiene un formato válido',
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

    const existingIdentity = await findWorldIdVerificationByNullifier(nullifier_hash);

    if (existingIdentity) {
      console.warn('[verify-world-id] nullifier_hash ya registrado', {
        nullifier_hash,
        existingUser: existingIdentity.user_id,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Esta identidad ya fue utilizada anteriormente',
        },
        { status: 409 }
      );
    }

    if (user_id) {
      const existingUserIdentity = await findWorldIdVerificationByUser(user_id);
      if (existingUserIdentity && existingUserIdentity.nullifier_hash !== nullifier_hash) {
        console.warn('[verify-world-id] user_id inconsistente', {
          user_id,
          nullifier_hash,
          existingNullifier: existingUserIdentity.nullifier_hash,
        });
        return NextResponse.json(
          {
            success: false,
            error: 'Este usuario ya está vinculado a otra identidad',
          },
          { status: 409 }
        );
      }
    }

    const actionName = action ?? 'trivia_game_access';

    const verifyRes = await verifyCloudProof(
      { proof, nullifier_hash, merkle_root, verification_level: verification_level ?? 'orb' },
      process.env.APP_ID as `app_${string}`,
      actionName
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

    const sessionToken = randomUUID();
    const userId = user_id ?? nullifier_hash;

    const identityRecord = await insertWorldIdVerification({
      action: actionName,
      merkle_root,
      nullifier_hash,
      verification_level: verification_level ?? 'orb',
      wallet_address,
      user_id: userId,
      session_token: sessionToken,
    });
    const response = NextResponse.json({
      success: true,
      userId: identityRecord.user_id,
      nullifier_hash: identityRecord.nullifier_hash,
      createdAt: identityRecord.created_at,
    });

    response.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    console.info('[verify-world-id] Verificación exitosa', {
      userId: identityRecord.user_id,
      sessionToken,
    });

    return response;
  } catch (error) {
    if (isLocalStorageDisabled(error)) {
      return NextResponse.json(
        { success: false, error: 'Persistencia local deshabilitada. Configure almacenamiento compartido o servicio remoto.' },
        { status: 503 }
      );
    }

    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'DUPLICATE_NULLIFIER') {
      return NextResponse.json(
        { success: false, error: 'Esta identidad ya fue utilizada anteriormente' },
        { status: 409 }
      );
    }

    console.error('[verify-world-id] Error inesperado', error);
    return NextResponse.json(
      { success: false, error: 'Error interno al verificar World ID' },
      { status: 500 }
    );
  }
}
