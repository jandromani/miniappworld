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
    return { success: false, message: errorText };
  }

  return { success: true };
}
