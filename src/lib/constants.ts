import { Tokens } from '@worldcoin/minikit-js';

export const APP_TITLE = 'Trivia 50x15';
export const TOURNAMENT_CONTRACT_ADDRESS =
  process.env.TOURNAMENT_CONTRACT_ADDRESS ?? '0x81f53Ab3c83C8123b1e1f5d7B9eC2E4445eA8123';

export const WLD_ADDRESS =
  process.env.NEXT_PUBLIC_WLD_ADDRESS ?? '0x1FfE36E4C7F1cdd192d08F7569bB31Ac5D2B6C2f';
export const USDC_ADDRESS =
  process.env.NEXT_PUBLIC_USDC_ADDRESS ?? '0xDECAF9CD2367cdbb726E904cD6397eDFcAe6068D';

const memecoinAddress =
  process.env.NEXT_PUBLIC_MEMECOIN_ADDRESS ?? '0xA9B68b83c130b67D2E0c5d44EeE466D70c1B2de4';

export const MEMECOIN_CONFIG = {
  address: memecoinAddress,
  symbol: process.env.NEXT_PUBLIC_MEMECOIN_SYMBOL ?? 'PUF',
  decimals: Number(process.env.NEXT_PUBLIC_MEMECOIN_DECIMALS ?? 18),
  name: process.env.NEXT_PUBLIC_MEMECOIN_NAME ?? 'PUF Memecoin',
  pufUrl: `worldapp://mini-app?app_id=app_puf&path=app/token/${memecoinAddress}`,
};

export const SUPPORTED_TOKENS = {
  WLD: {
    symbol: Tokens.WLD,
    name: 'Worldcoin',
    decimals: 18,
    address: WLD_ADDRESS,
  },
  USDC: {
    symbol: Tokens.USDC,
    name: 'USD Coin',
    decimals: 6,
    address: USDC_ADDRESS,
  },
  MEMECOIN: MEMECOIN_CONFIG,
} as const;

export type SupportedToken = keyof typeof SUPPORTED_TOKENS;

export function resolveTokenFromAddress(address: string): SupportedToken | null {
  if (!address) return null;

  const match = Object.entries(SUPPORTED_TOKENS).find(([, token]) =>
    token.address.toLowerCase() === address.toLowerCase()
  );

  return (match?.[0] as SupportedToken) ?? null;
}

export function getTokenSymbolByAddress(address: string): string {
  const token = resolveTokenFromAddress(address);
  if (!token) return 'Unknown';

  return SUPPORTED_TOKENS[token].symbol;
}

export function getTokenDecimalsByAddress(address: string): number {
  const token = resolveTokenFromAddress(address);
  if (!token) return 18; // Fallback to 18 decimals to avoid blocking flows when token metadata is missing

  return SUPPORTED_TOKENS[token].decimals;
}
