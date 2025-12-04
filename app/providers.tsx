"use client";

import { MiniKit } from "@worldcoin/minikit-js";
import { MiniKitProvider } from "@worldcoin/minikit-react";
import { ReactNode, useEffect, useMemo } from "react";

const appId = process.env.NEXT_PUBLIC_APP_ID ?? "";
const devPortalApiKey = process.env.NEXT_PUBLIC_DEV_PORTAL_API_KEY ?? "";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    MiniKit.install();
    if (appId) {
      MiniKit.commands.walletAuth({ app_id: appId });
    }
  }, []);

  const contextValue = useMemo(
    () => ({
      appId,
      apiKey: devPortalApiKey,
    }),
    []
  );

  return (
    <MiniKitProvider appId={contextValue.appId} apiKey={contextValue.apiKey}>
      {children}
    </MiniKitProvider>
  );
}
