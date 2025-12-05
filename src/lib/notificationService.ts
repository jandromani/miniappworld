type NotifyParams = {
  walletAddresses: string[];
  title: string;
  message: string;
  miniAppPath?: string;
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendNotification({ walletAddresses, title, message, miniAppPath }: NotifyParams) {
  if (!process.env.DEV_PORTAL_API_KEY || !process.env.APP_ID) {
    return { success: false, message: 'Config missing' };
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch('https://developer.worldcoin.org/api/v2/minikit/send-notification', {
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
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (attempt < MAX_RETRIES) {
          console.warn('Retrying notification send', { attempt, errorText });
          await delay(RETRY_DELAY_MS);
          continue;
        }
        return { success: false, message: errorText };
      }

      return { success: true };
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Unknown notification error',
        };
      }

      console.warn('Retrying notification send after error', {
        attempt,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      await delay(RETRY_DELAY_MS);
    }
  }

  return { success: false, message: 'Notification send exhausted retries' };
}
