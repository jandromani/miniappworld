import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import { MiniKitProvider } from '@/components/MiniKitProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Trivia 50x15',
  description: 'Juego de trivia con premios en WLD y USDC',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <MiniKitProvider>{children}</MiniKitProvider>
      </body>
    </html>
  );
}
