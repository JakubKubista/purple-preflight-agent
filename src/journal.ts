import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { JournalEntry, JournalRecorder } from './domain.js';

/**
 * Append-only decision journal, one JSON object per line.
 *
 * Deliberately not more than that. Hash-chaining was designed for and cut —
 * tamper-evidence is narrative at demo scale, and JSONL is schemaless, so adding
 * a prevHash later costs nothing. Reserving a null field now would have bought
 * nothing but the appearance of foresight.
 *
 * Synchronous on purpose: the entry must be durable before the caller returns,
 * so a crash between forwarding and journalling can't lose the record of what
 * was sent.
 */
export function createFileJournal(path: string): JournalRecorder {
  mkdirSync(dirname(path), { recursive: true });
  return (entry: JournalEntry) => {
    appendFileSync(path, JSON.stringify(entry) + '\n', 'utf8');
  };
}
