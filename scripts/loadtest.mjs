import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import autocannon from 'autocannon';

const target = process.env.LOADTEST_TARGET ?? 'http://localhost:3000';
const connections = Number(process.env.LOADTEST_USERS ?? '10');
const duration = Number(process.env.LOADTEST_DURATION ?? '30');
const tournamentId = process.env.LOADTEST_TOURNAMENT_ID ?? 'demo-tournament';
const notificationWallets = process.env.LOADTEST_NOTIFICATION_WALLETS ?? '';
const sessionCookie = process.env.LOADTEST_SESSION_COOKIE;
const csrfToken = process.env.LOADTEST_CSRF_TOKEN;
const outputFile = process.env.LOADTEST_OUTPUT ?? path.join(process.cwd(), 'loadtest-results.json');

const headers = { 'content-type': 'application/json' };
if (sessionCookie) headers.cookie = sessionCookie;
if (csrfToken) headers['x-csrf-token'] = csrfToken;

function buildRequest({ method, path: requestPath, body }) {
  return {
    method,
    path: requestPath,
    headers,
    body: JSON.stringify(body),
  };
}

function buildPaymentReference() {
  return randomUUID().replace(/-/g, '');
}

const defaultWallets = notificationWallets
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const baseRequests = () => {
  const reference = buildPaymentReference();
  const tournamentJoinPath = `/api/tournaments/${tournamentId}/join`;

  return [
    buildRequest({
      method: 'POST',
      path: '/api/initiate-payment',
      body: {
        reference,
        type: 'tournament',
        token: 'WLD',
        amount: 1,
        tournamentId,
        walletAddress: process.env.LOADTEST_WALLET_ADDRESS,
        userId: process.env.LOADTEST_USER_ID,
      },
    }),
    buildRequest({
      method: 'POST',
      path: '/api/confirm-payment',
      body: {
        reference,
        payload: {
          status: 'success',
          transaction_id: `txn-${reference}`,
          wallet_address: process.env.LOADTEST_WALLET_ADDRESS,
          token: 'WLD',
          token_amount: '1000000000000000000',
        },
      },
    }),
    buildRequest({
      method: 'POST',
      path: tournamentJoinPath,
      body: {
        token: 'WLD',
        amount: 1,
        userId: process.env.LOADTEST_USER_ID,
        username: `loadtest-${reference.slice(0, 6)}`,
        walletAddress: process.env.LOADTEST_WALLET_ADDRESS,
        score: 0,
        paymentReference: reference,
      },
    }),
    buildRequest({
      method: 'POST',
      path: '/api/send-notification',
      body: {
        walletAddresses: defaultWallets,
        title: 'Load test notification',
        message: 'Synthetic notification used for throughput validation',
        miniAppPath: '/game',
        nonce: reference,
      },
    }),
  ];
};

async function run() {
  console.log(`Running load test against ${target} for ${duration}s with ${connections} connections...`);

  const instance = autocannon(
    {
      url: target,
      connections,
      duration,
      requests: baseRequests(),
      timeout: 10_000,
    },
    async (err, result) => {
      if (err) {
        console.error('Load test failed', err);
        return;
      }

      const summary = {
        target,
        connections,
        duration,
        latency: result.latency,
        requests: result.requests,
        throughput: result.throughput,
        errors: result.errors,
        timeouts: result.timeouts,
      };

      await fs.writeFile(outputFile, JSON.stringify(summary, null, 2), 'utf8');
      console.log(`Results written to ${outputFile}`);
    }
  );

  process.once('SIGINT', () => instance.stop());
}

run().catch((error) => {
  console.error('Load test script failed', error);
  process.exit(1);
});
