import { MEMECOIN_CONFIG, SUPPORTED_TOKENS, WLD_ADDRESS, USDC_ADDRESS } from './constants';

const SYMBOL_TO_ADDRESS: Record<string, string> = {
  WLD: WLD_ADDRESS,
  USDC: USDC_ADDRESS,
  PUF: MEMECOIN_CONFIG.address,
  [MEMECOIN_CONFIG.symbol.toUpperCase()]: MEMECOIN_CONFIG.address,
};

export function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function isSupportedTokenSymbol(value?: string): boolean {
  if (!value) return false;
  const upper = value.trim().toUpperCase();
  return Boolean(upper && SYMBOL_TO_ADDRESS[upper]);
}

export function isSupportedTokenAddress(value?: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!isAddress(trimmed)) return false;
  return Object.values(SUPPORTED_TOKENS).some((token) => token.address.toLowerCase() === trimmed.toLowerCase());
}

export function normalizeTokenIdentifier(token?: string): string {
  if (!token) throw new Error('Token requerido para normalizar');
  const trimmed = token.trim();
  const upper = trimmed.toUpperCase();

  if (SYMBOL_TO_ADDRESS[upper]) {
    return SYMBOL_TO_ADDRESS[upper].toLowerCase();
  }

  if (isAddress(trimmed)) {
    return trimmed.toLowerCase();
  }

  const found = Object.values(SUPPORTED_TOKENS).find(
    (cfg) => cfg.symbol?.toUpperCase?.() === upper || cfg.address?.toLowerCase() === trimmed.toLowerCase()
  );

  if (found?.address && isAddress(found.address)) {
    return found.address.toLowerCase();
  }

  throw new Error(`Token ${token} no es válido o no está soportado`);
}

export function tokensMatch(a: string, b: string): boolean {
  return normalizeTokenIdentifier(a) === normalizeTokenIdentifier(b);
}
