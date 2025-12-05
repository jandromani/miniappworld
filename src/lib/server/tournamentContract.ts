import { TOURNAMENT_CONTRACT_ADDRESS } from '@/lib/constants';
import { http, createWalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { stringToHex } from 'viem/utils';

const TOURNAMENT_MANAGER_ABI = [
  {
    type: 'function',
    name: 'distributePrizes',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tournamentId', type: 'bytes32' }],
    outputs: [],
  },
] as const;

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

function getWalletClient() {
  const rpcUrl = getRequiredEnv('RPC_URL');
  const privateKey = getRequiredEnv('TOURNAMENT_DISTRIBUTOR_PRIVATE_KEY');
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  return createWalletClient({
    account,
    transport: http(rpcUrl),
  });
}

export async function distributePrizesOnChain(tournamentId: string) {
  const client = getWalletClient();
  const tournamentIdBytes = stringToHex(tournamentId, { size: 32 });

  return client.writeContract({
    address: TOURNAMENT_CONTRACT_ADDRESS as `0x${string}`,
    abi: TOURNAMENT_MANAGER_ABI,
    functionName: 'distributePrizes',
    args: [tournamentIdBytes],
  });
}
