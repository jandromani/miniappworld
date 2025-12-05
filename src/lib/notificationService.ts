import { fetchWithBackoff } from './fetchWithBackoff';

type NotifyParams = {
  walletAddresses: string[];
  title: string;
  message: string;
  miniAppPath?: string;
};

export async function sendNotification({ walletAddresses, title, message, miniAppPath }: NotifyParams) {
  if (!process.env.DEV_PORTAL_API_KEY || !process.env.APP_ID) {
    return { success: false, message: 'Config missing' };
  }

  try {
    const response = await fetchWithBackoff('https://developer.worldcoin.org/api/v2/minikit/send-notification', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DEV_PORTAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: process.env.APP_ID,
        wallet_addresses: walletAddresses,
        localisations: [
          { language: 'en', title, message },
          { language: 'es', title, message },
        ],
        mini_app_path: miniAppPath,
      }),
      timeoutMs: 6000,
      maxRetries: 3,
    });

    if (!response.ok) {
      return { success: false, message: await response.text() };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown notification error',
    };
  }
}
