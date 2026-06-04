import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createChildLogger } from '../lib/logger';

const log = createChildLogger('settlement-generator');

const BANK_NAMES = ['HDFC', 'ICICI', 'SBI', 'AXIS', 'KOTAK'];

/**
 * Generate a realistic HDFC/ICICI-format settlement CSV.
 * Mixes matched and unmatched records for reconciliation testing.
 */
export function generateSettlementCSV(
  outputDir: string,
  rowCount: number = 100
): string {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bankName = BANK_NAMES[Math.floor(Math.random() * BANK_NAMES.length)];
  const filename = `${bankName}_settlement_${timestamp}.csv`;
  const filepath = path.join(outputDir, filename);

  // CSV header
  const headers = [
    'UTR',
    'RRN',
    'Amount',
    'Currency',
    'Settlement_Date',
    'Bank_Name',
    'Merchant_Ref',
    'Status',
  ].join(',');

  const rows: string[] = [headers];

  for (let i = 0; i < rowCount; i++) {
    const utr = generateUTR(bankName);
    const rrn = generateRRN();
    // Amount between ₹100 and ₹50,000 in paise
    const amountPaise = Math.floor(Math.random() * 4990000) + 10000;
    const settlementDate = generateRecentDate();
    const merchantRef = `ORD-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const status = Math.random() > 0.05 ? 'SETTLED' : 'PENDING';

    rows.push(
      [
        utr,
        rrn,
        amountPaise.toString(),
        'INR',
        settlementDate,
        bankName,
        merchantRef,
        status,
      ].join(',')
    );
  }

  fs.writeFileSync(filepath, rows.join('\n'), 'utf-8');
  log.info({ filepath, rowCount }, 'Settlement CSV generated');

  return filepath;
}

/**
 * Generate a realistic UTR (Unique Transaction Reference).
 * Format: BANKYYYYMMDDNNNNNNN
 */
function generateUTR(bankPrefix: string): string {
  const date = new Date();
  const dateStr =
    date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0');
  const seq = Math.floor(Math.random() * 9999999)
    .toString()
    .padStart(7, '0');
  return `${bankPrefix}${dateStr}${seq}`;
}

/**
 * Generate a realistic RRN (Retrieval Reference Number).
 * 12-digit numeric string.
 */
function generateRRN(): string {
  return Math.floor(Math.random() * 999999999999)
    .toString()
    .padStart(12, '0');
}

/**
 * Generate a recent date (within last 7 days) in ISO format.
 */
function generateRecentDate(): string {
  const now = Date.now();
  const daysAgo = Math.floor(Math.random() * 7);
  const hoursAgo = Math.floor(Math.random() * 24);
  const date = new Date(now - daysAgo * 86400000 - hoursAgo * 3600000);
  return date.toISOString();
}

/**
 * List all CSV files in the settlements directory.
 */
export function listSettlementFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.csv'))
    .map((f) => path.join(dir, f))
    .sort();
}
