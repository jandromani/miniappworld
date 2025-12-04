'use client';

import { ReactNode, useEffect } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';

export const MiniKitProvider = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    // Instalar MiniKit al montar el componente
    MiniKit.install();

    // Opcional: Verificar si está instalado
    if (!MiniKit.isInstalled()) {
      console.warn('MiniKit no está instalado. Abre la app en World App.');
    }
  }, []);

  return <>{children}</>;
};
