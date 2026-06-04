import fs from 'fs';
import { parse } from 'csv-parse';
import { prisma } from '../lib/prisma';
import { createChildLogger } from '../lib/logger';
import { emitProgress } from '../lib/socket';

const log = createChildLogger('settlement-ingestion');

const CHUNK_SIZE = 1000;

interface SettlementRow {
  UTR: string;
  RRN: string;
  Amount: string;
  Currency: string;
  Settlement_Date: string;
  Bank_Name: string;
  Merchant_Ref: string;
  Status: string;
}

/**
 * Ingest a settlement CSV file using streaming + chunked transactional inserts.
 * 
 * - Streams the CSV via csv-parse (no full file in memory)
 * - Buffers rows in chunks of 1000
 * - Inserts each chunk in a single Postgres transaction
 * - On chunk failure, rolls back only that chunk — continues with next
 * - Tracks progress in ReconciliationRun, emits Socket.IO progress events
 */
export async function ingestSettlementCSV(
  filePath: string,
  runId: string
): Promise<{ totalRows: number; insertedRows: number; failedChunks: number }> {
  log.info({ filePath, runId }, 'Starting settlement CSV ingestion');

  let totalRows = 0;
  let insertedRows = 0;
  let failedChunks = 0;
  let buffer: SettlementRow[] = [];

  // Count total lines for progress reporting
  const totalLines = await countLines(filePath);

  return new Promise((resolve, reject) => {
    const parser = fs.createReadStream(filePath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
      })
    );

    parser.on('data', async (row: SettlementRow) => {
      buffer.push(row);
      totalRows++;

      if (buffer.length >= CHUNK_SIZE) {
        parser.pause();
        const chunk = [...buffer];
        buffer = [];

        try {
          await insertChunk(chunk, filePath);
          insertedRows += chunk.length;
        } catch (error) {
          log.error(
            { err: error, chunkStart: totalRows - chunk.length, chunkEnd: totalRows },
            'Chunk insertion failed — rolling back chunk, continuing'
          );
          failedChunks++;
        }

        // Update progress
        await updateRunProgress(runId, totalRows);
        emitProgress(runId, totalRows, totalLines);
        parser.resume();
      }
    });

    parser.on('end', async () => {
      // Process remaining buffer
      if (buffer.length > 0) {
        try {
          await insertChunk(buffer, filePath);
          insertedRows += buffer.length;
        } catch (error) {
          log.error({ err: error }, 'Final chunk insertion failed');
          failedChunks++;
        }
      }

      await updateRunProgress(runId, totalRows);
      emitProgress(runId, totalRows, totalLines);

      log.info(
        { filePath, totalRows, insertedRows, failedChunks },
        'Settlement CSV ingestion complete'
      );

      resolve({ totalRows, insertedRows, failedChunks });
    });

    parser.on('error', (error) => {
      log.error({ err: error, filePath }, 'CSV parsing error');
      reject(error);
    });
  });
}

/**
 * Insert a chunk of settlement rows in a single transaction.
 * Uses skipDuplicates to handle re-ingestion of the same file gracefully.
 */
async function insertChunk(rows: SettlementRow[], sourceFile: string): Promise<void> {
  const data = rows.map((row) => ({
    utr: row.UTR,
    rrn: row.RRN || null,
    amountMinor: BigInt(row.Amount),
    settledAt: new Date(row.Settlement_Date),
    bankName: row.Bank_Name || null,
    sourceFile,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.bankSettlement.createMany({
      data,
      skipDuplicates: true, // Skip if UTR already exists (idempotent re-ingestion)
    });
  });
}

/**
 * Update the reconciliation run's progress counter.
 */
async function updateRunProgress(runId: string, totalProcessed: number): Promise<void> {
  try {
    await prisma.reconciliationRun.update({
      where: { id: runId },
      data: { totalProcessed },
    });
  } catch (error) {
    log.warn({ err: error, runId }, 'Failed to update run progress');
  }
}

/**
 * Count lines in a file (for progress estimation).
 */
function countLines(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    let count = 0;
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      for (let i = 0; i < buf.length; i++) {
        if (buf[i] === 10) count++; // newline character
      }
    });
    stream.on('end', () => resolve(count));
    stream.on('error', () => resolve(0));
  });
}
