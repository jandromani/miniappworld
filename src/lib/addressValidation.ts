import { getAddress } from 'ethers';

export function checksumAddress(address: string): string {
  return getAddress(address);
}

export function isValidEvmAddress(address: unknown): address is string {
  if (typeof address !== 'string') return false;

  try {
    checksumAddress(address);
    return true;
  } catch (error) {
    return false;
  }
}
