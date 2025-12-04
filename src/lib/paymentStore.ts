import { promises as fs } from 'fs';
import path from 'path';

export type PaymentStatus = 'pending' | 'confirmed' | 'failed';

export type PaymentRecord = {
  reference: string;
  type: 'quick_match' | 'tournament';
  token?: string;
  amount?: number;
  status: PaymentStatus;
  tournamentId?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

const PAYMENTS_DB_PATH = path.join(process.cwd(), 'data', 'payments.json');

async function ensureDb(): Promise<void> {
  await fs.mkdir(path.dirname(PAYMENTS_DB_PATH), { recursive: true });

  try {
    await fs.access(PAYMENTS_DB_PATH);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await fs.writeFile(PAYMENTS_DB_PATH, JSON.stringify([], null, 2), 'utf8');
    } else {
      throw error;
    }
  }
}

async function readPayments(): Promise<PaymentRecord[]> {
  await ensureDb();

  const content = await fs.readFile(PAYMENTS_DB_PATH, 'utf8');
  return JSON.parse(content) as PaymentRecord[];
}

async function writePayments(payments: PaymentRecord[]): Promise<void> {
  await fs.writeFile(PAYMENTS_DB_PATH, JSON.stringify(payments, null, 2), 'utf8');
}

export async function createPayment(record: Omit<PaymentRecord, 'createdAt' | 'updatedAt'>) {
  const payments = await readPayments();

  if (payments.some((payment) => payment.reference === record.reference)) {
    throw new Error('Referencia duplicada');
  }

  const timestamp = new Date().toISOString();
  const newRecord: PaymentRecord = { ...record, createdAt: timestamp, updatedAt: timestamp };
  payments.push(newRecord);
  await writePayments(payments);
  return newRecord;
}

export async function findPayment(reference: string): Promise<PaymentRecord | undefined> {
  const payments = await readPayments();
  return payments.find((payment) => payment.reference === reference);
}

export async function updatePayment(
  reference: string,
  updates: Partial<Omit<PaymentRecord, 'reference' | 'createdAt'>>
): Promise<PaymentRecord | undefined> {
  const payments = await readPayments();
  const index = payments.findIndex((payment) => payment.reference === reference);

  if (index === -1) {
    return undefined;
  }

  const updatedPayment: PaymentRecord = {
    ...payments[index],
    ...updates,
    reference,
    createdAt: payments[index].createdAt,
    updatedAt: new Date().toISOString(),
  };

  payments[index] = updatedPayment;
  await writePayments(payments);
  return updatedPayment;
}
