import { jest } from '@jest/globals';

let installed = true;

const verifyMock = jest.fn();
const verifyCloudProofMock = jest.fn();
const payMock = jest.fn();
const sendTransactionMock = jest.fn();
const hapticFeedbackMock = jest.fn();

export const VerificationLevel = {
  Orb: 'orb',
};

export const Tokens = {
  WLD: 'WLD',
  USDC: 'USDC',
  DAI: 'DAI',
};

const TOKEN_DECIMALS: Record<string, number> = {
  WLD: 18,
  USDC: 6,
  DAI: 18,
};

export const MiniKit = {
  install: jest.fn(() => {
    installed = true;
  }),
  isInstalled: jest.fn(() => installed),
  commandsAsync: {
    verify: (...args: any[]) => verifyMock(...args),
    pay: (...args: any[]) => payMock(...args),
    sendTransaction: (...args: any[]) => sendTransactionMock(...args),
    sendHapticFeedback: (...args: any[]) => hapticFeedbackMock(...args),
  },
  commands: {
    sendHapticFeedback: (...args: any[]) => hapticFeedbackMock(...args),
  },
};

export const verifyCloudProof = (...args: any[]) => verifyCloudProofMock(...args);

export function tokenToDecimals(amount: number, token: string) {
  const decimals = TOKEN_DECIMALS[token] ?? 18;
  const scaled = BigInt(Math.round(amount * 10 ** decimals));
  return scaled;
}

export function __setInstalled(value: boolean) {
  installed = value;
}

export function __setVerifyResponse(response: any) {
  verifyMock.mockResolvedValue(response);
}

export function __setPayResponse(response: any) {
  payMock.mockResolvedValue(response);
}

export function __setSendTransactionResponse(response: any) {
  sendTransactionMock.mockResolvedValue(response);
}

export function __setVerifyCloudProofResponse(response: any) {
  verifyCloudProofMock.mockResolvedValue(response);
}

export function __resetMiniKitMocks() {
  verifyMock.mockReset();
  verifyCloudProofMock.mockReset();
  payMock.mockReset();
  sendTransactionMock.mockReset();
  hapticFeedbackMock.mockReset();
  installed = true;
}
