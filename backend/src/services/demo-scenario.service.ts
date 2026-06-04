import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { createChildLogger } from '../lib/logger';

const log = createChildLogger('demo-scenario');

const BANK_NAMES = ['HDFC', 'ICICI', 'SBI', 'AXIS', 'KOTAK'];

export type DemoMode = 'quick' | 'demo' | 'stress';

interface SettlementCsvRow {
  UTR: string;
  RRN: string;
  Amount: string;
  Currency: string;
  Settlement_Date: string;
  Bank_Name: string;
  Merchant_Ref: string;
  Status: string;
}

interface DemoScenarioResult {
  filePath: string;
  rowCount: number;
  profile: {
    exact: number;
    timeWindow: number;
    feeMismatch: number;
    missingGateway: number;
    missingSettlement: number;
    noise: number;
  };
}

export function rowCountForMode(mode: DemoMode): number {
  if (mode === 'stress') return 1000;
  if (mode === 'demo') return 120;
  return 36;
}

export async function createDemoScenario(
  outputDir: string,
  mode: DemoMode = 'quick'
): Promise<DemoScenarioResult> {
  const rowCount = rowCountForMode(mode);
  const rows: SettlementCsvRow[] = [];
  const profile = {
    exact: mode === 'quick' ? 8 : 14,
    timeWindow: mode === 'quick' ? 4 : 8,
    feeMismatch: mode === 'quick' ? 4 : 8,
    missingGateway: mode === 'quick' ? 4 : 10,
    missingSettlement: mode === 'quick' ? 4 : 10,
    noise: 0,
  };

  for (let i = 0; i < profile.exact; i++) {
    const amountMinor = amountFor(i, 82000);
    const utr = generateUTR('HDFC');
    const order = await createDemoOrder(amountMinor, 'Exact gateway reference match');
    await createDemoGatewayTxn({
      orderId: order.id,
      gatewayRef: utr,
      amountMinor,
      feeMinor: 0n,
      scenario: 'exact_match',
      receivedAt: recentDate(i),
    });
    rows.push(createSettlementRow({ utr, amountMinor, bankName: 'HDFC', merchantRef: order.externalRef }));
  }

  for (let i = 0; i < profile.timeWindow; i++) {
    const amountMinor = amountFor(i, 124000);
    const order = await createDemoOrder(amountMinor, 'Same amount settled inside the 24h window');
    await createDemoGatewayTxn({
      orderId: order.id,
      gatewayRef: `pi_demo_${token(10)}`,
      amountMinor,
      feeMinor: 0n,
      scenario: 'time_window_match',
      receivedAt: recentDate(i, -3),
    });
    rows.push(
      createSettlementRow({
        utr: generateUTR('ICICI'),
        amountMinor,
        bankName: 'ICICI',
        merchantRef: order.externalRef,
        settledAt: recentDate(i, -1),
      })
    );
  }

  for (let i = 0; i < profile.feeMismatch; i++) {
    const orderAmountMinor = amountFor(i, 160000);
    const feeMinor = BigInt(1200 + i * 75);
    const settlementAmountMinor = orderAmountMinor - feeMinor;
    const order = await createDemoOrder(orderAmountMinor, 'Gateway fee explains the settlement delta');
    await createDemoGatewayTxn({
      orderId: order.id,
      gatewayRef: `ch_fee_${token(10)}`,
      amountMinor: orderAmountMinor,
      feeMinor,
      scenario: 'fee_adjusted_match',
      receivedAt: recentDate(i, -2),
    });
    rows.push(
      createSettlementRow({
        utr: generateUTR('AXIS'),
        amountMinor: settlementAmountMinor,
        bankName: 'AXIS',
        merchantRef: order.externalRef,
        settledAt: recentDate(i),
      })
    );
  }

  for (let i = 0; i < profile.missingGateway; i++) {
    rows.push(
      createSettlementRow({
        utr: generateUTR('SBI'),
        amountMinor: amountFor(i, 54000),
        bankName: 'SBI',
        merchantRef: `BANK-ONLY-${token(6)}`,
      })
    );
  }

  for (let i = 0; i < profile.missingSettlement; i++) {
    const amountMinor = amountFor(i, 96000);
    const order = await createDemoOrder(amountMinor, 'Captured by gateway, absent from bank file');
    await createDemoGatewayTxn({
      orderId: order.id,
      gatewayRef: `ch_missing_${token(10)}`,
      amountMinor,
      feeMinor: 0n,
      scenario: 'missing_settlement',
      receivedAt: recentDate(i),
    });
  }

  while (rows.length < rowCount) {
    rows.push(
      createSettlementRow({
        utr: generateUTR(randomBank()),
        amountMinor: BigInt(Math.floor(Math.random() * 4990000) + 10000),
        bankName: randomBank(),
        merchantRef: `NOISE-${token(8)}`,
      })
    );
    profile.noise++;
  }

  const filePath = writeSettlementCsv(outputDir, rows, mode);
  log.info({ filePath, rowCount, profile }, 'Demo reconciliation scenario generated');
  return { filePath, rowCount, profile };
}

async function createDemoOrder(amountMinor: bigint, description: string) {
  return prisma.order.create({
    data: {
      externalRef: `ORD-DEMO-${token(12)}`,
      amountMinor,
      currency: 'INR',
      status: 'PAID',
      customerEmail: `demo-${token(5).toLowerCase()}@reconcileflow.test`,
      description,
    },
  });
}

async function createDemoGatewayTxn(params: {
  orderId: string;
  gatewayRef: string;
  amountMinor: bigint;
  feeMinor: bigint;
  scenario: string;
  receivedAt: Date;
}) {
  return prisma.gatewayTransaction.create({
    data: {
      orderId: params.orderId,
      gatewayEventId: `evt_demo_${token(18)}`,
      gatewayRef: params.gatewayRef,
      amountMinor: params.amountMinor,
      feeMinor: params.feeMinor,
      status: 'PROCESSED',
      rawPayload: {
        demo: true,
        scenario: params.scenario,
        gatewayRef: params.gatewayRef,
      },
      receivedAt: params.receivedAt,
    },
  });
}

function createSettlementRow(params: {
  utr: string;
  amountMinor: bigint;
  bankName: string;
  merchantRef: string;
  settledAt?: Date;
}): SettlementCsvRow {
  return {
    UTR: params.utr,
    RRN: generateRRN(),
    Amount: params.amountMinor.toString(),
    Currency: 'INR',
    Settlement_Date: (params.settledAt ?? recentDate()).toISOString(),
    Bank_Name: params.bankName,
    Merchant_Ref: params.merchantRef,
    Status: 'SETTLED',
  };
}

function writeSettlementCsv(outputDir: string, rows: SettlementCsvRow[], mode: DemoMode): string {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(outputDir, `DEMO_${mode}_settlement_${timestamp}.csv`);
  const headers: Array<keyof SettlementCsvRow> = [
    'UTR',
    'RRN',
    'Amount',
    'Currency',
    'Settlement_Date',
    'Bank_Name',
    'Merchant_Ref',
    'Status',
  ];

  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => row[header]).join(',')),
  ].join('\n');

  fs.writeFileSync(filePath, csv, 'utf-8');
  return filePath;
}

function amountFor(index: number, base: number): bigint {
  return BigInt(base + index * 7311);
}

function recentDate(offset = 0, hoursShift = 0): Date {
  const date = new Date();
  date.setHours(date.getHours() + hoursShift);
  date.setMinutes(date.getMinutes() - offset * 11);
  return date;
}

function generateUTR(bankPrefix: string): string {
  const date = new Date();
  const dateStr =
    date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0');
  return `${bankPrefix}${dateStr}${Math.floor(Math.random() * 9999999)
    .toString()
    .padStart(7, '0')}`;
}

function generateRRN(): string {
  return Math.floor(Math.random() * 999999999999)
    .toString()
    .padStart(12, '0');
}

function randomBank(): string {
  return BANK_NAMES[Math.floor(Math.random() * BANK_NAMES.length)];
}

function token(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex').toUpperCase();
}
