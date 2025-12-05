'use client';

import { MiniKit } from '@worldcoin/minikit-js';

export async function sendNotificationHaptics(style: 'success' | 'error', enabled: boolean) {
  if (!enabled) return;

  try {
    await MiniKit.commandsAsync.sendHapticFeedback({
      hapticsType: 'notification',
      style,
    });
  } catch (error) {
    console.warn('No se pudo enviar feedback háptico', error);
  }
}
