import { buildDriver, tournamentFixtures } from './fixtures/databaseDrivers';

const drivers = ['postgres', 'sqlite'] as const;

describe.each(drivers)('aislamiento transaccional en %s', (driverName) => {
  const driver = buildDriver(driverName);
  const fixtures = tournamentFixtures();

  beforeEach(() => {
    driver.seed(fixtures);
  });

  it('aplica contención concurrente cuando dos confirmaciones compiten por el mismo pago', async () => {
    const [txA, txB] = [driver.startTransaction(), driver.startTransaction()];
    txA.confirmPayment('pay-ref-001', { transactionId: 'tx-A' });
    txB.confirmPayment('pay-ref-001', { transactionId: 'tx-B' });

    const commitResults = await Promise.allSettled([txA.commit(), txB.commit()]);
    const successfulCommits = commitResults.filter((result) => result.status === 'fulfilled');

    expect(successfulCommits).toHaveLength(1);

    const conflict = commitResults.find(
      (result) => result.status === 'rejected' && /Concurrent write/i.test(result.reason as string)
    );

    expect(conflict).toBeDefined();

    const persisted = driver.currentPayment('pay-ref-001');
    expect(persisted?.status).toBe('confirmed');
    expect(['tx-A', 'tx-B']).toContain(persisted?.transaction_id);
  });

  it('respeta aislamiento al añadir participantes mientras se procesan pagos', async () => {
    const txPayment = driver.startTransaction();
    const txParticipant = driver.startTransaction();

    txPayment.confirmPayment('pay-ref-002', { transactionId: 'tx-200' });

    txParticipant.enqueueParticipant({
      tournament_id: 't-main',
      user_id: 'user-002',
      payment_reference: 'pay-ref-002',
      joined_at: new Date().toISOString(),
      status: 'pending',
    });

    const [paymentResult, participantResult] = await Promise.allSettled([
      txPayment.commit(),
      txParticipant.commit(),
    ]);

    expect(paymentResult.status).toBe('fulfilled');
    expect(participantResult.status).toBe('fulfilled');

    const participants = driver.participantsForTournament('t-main');
    expect(participants).toHaveLength(1);
    expect(participants[0]).toEqual(
      expect.objectContaining({ user_id: 'user-002', payment_reference: 'pay-ref-002' })
    );

    const persistedPayment = driver.currentPayment('pay-ref-002');
    expect(persistedPayment?.status).toBe('confirmed');
  });

  it('mantiene lecturas repetibles dentro de la misma transacción', async () => {
    const tx = driver.startTransaction();
    const firstRead = tx.readPayment('pay-ref-001');

    tx.confirmPayment('pay-ref-001', { transactionId: 'tx-repeatable' });
    const secondRead = tx.readPayment('pay-ref-001');

    expect(firstRead?.status).toBe('pending');
    expect(secondRead?.status).toBe('confirmed');

    await tx.commit();

    const outside = driver.currentPayment('pay-ref-001');
    expect(outside?.transaction_id).toBe('tx-repeatable');
  });
});
