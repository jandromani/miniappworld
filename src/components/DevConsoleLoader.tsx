'use client';

import { useEffect } from 'react';

const shouldEnableEruda = process.env.NEXT_PUBLIC_ENABLE_ERUDA === 'true';

export function DevConsoleLoader() {
  useEffect(() => {
    if (!shouldEnableEruda) return;

    import('eruda')
      .then(({ default: eruda }) => {
        if (!eruda?._isInit) {
          eruda?.init();
        }
      })
      .catch((error) => {
        console.warn('[devtools] No se pudo iniciar Eruda', error);
      });
  }, []);

  return null;
}
