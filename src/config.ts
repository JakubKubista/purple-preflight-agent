import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import type { Mode, SymbolMeta } from './domain.js';

/**
 * Config loading. Every failure here is fatal by design.
 *
 * A gate that starts with no policy, or with a policy it couldn't parse, is
 * worse than no gate — the operator believes they're protected. So these throw
 * rather than falling back to defaults, and the messages say what to do rather
 * than only what broke.
 */

const PolicySchema = z.object({
  mode: z.enum(['observe', 'enforce']).optional(),
  rules: z.object({
    'mandatory-stop-loss': z.object({ enabled: z.boolean() }).optional(),
    // Keyed by symbolName, value is the ceiling in lots.
    'max-lots-per-symbol': z.record(z.string(), z.number().positive()).optional(),
  }),
});

export type Policy = z.infer<typeof PolicySchema>;

const SymbolsSchema = z.object({
  provenance: z.object({
    broker: z.string(),
    environment: z.string(),
    source: z.string(),
    status: z.string().optional(),
    as_of: z.union([z.string(), z.date()]).optional(),
  }),
  symbols: z.record(
    z.string(),
    z.object({
      symbolName: z.string(),
      pipDigits: z.number().int().nonnegative(),
      lotSize: z.number().positive(),
      minVolume: z.number().positive().optional(),
      maxVolume: z.number().positive().optional(),
    }),
  ),
});

export interface SymbolTable {
  provenance: z.infer<typeof SymbolsSchema>['provenance'];
  bySymbolId: Map<number, SymbolMeta>;
}

function loadYaml(path: string, what: string): unknown {
  try {
    return parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(
      `Preflight cannot start: failed to read ${what} at ${path}. ` +
        `Copy the template from the repo root and try again. (${String(err)})`,
    );
  }
}

export function loadPolicy(path: string): Policy {
  const parsed = PolicySchema.safeParse(loadYaml(path, 'policy.yaml'));
  if (!parsed.success) {
    throw new Error(
      `Preflight cannot start: ${path} is not a valid policy. ` +
        `Refusing to run unprotected — a gate that silently allows everything ` +
        `is worse than no gate. Problems: ${parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ')}`,
    );
  }
  return parsed.data;
}

export function loadSymbols(path: string): SymbolTable {
  const parsed = SymbolsSchema.safeParse(loadYaml(path, 'symbols.yaml'));
  if (!parsed.success) {
    throw new Error(
      `Preflight cannot start: ${path} is not a valid symbol table. ` +
        `Without verified contract metadata every sizing decision would be a ` +
        `guess. Problems: ${parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ')}`,
    );
  }

  const bySymbolId = new Map<number, SymbolMeta>();
  for (const [id, meta] of Object.entries(parsed.data.symbols)) {
    bySymbolId.set(Number(id), meta);
  }
  return { provenance: parsed.data.provenance, bySymbolId };
}

export interface RuntimeConfig {
  slug: string;
  url: string;
  mode: Mode;
}

export function loadRuntimeConfig(policy: Policy, env: NodeJS.ProcessEnv): RuntimeConfig {
  const slug = env.PREFLIGHT_CTRADER_SLUG;
  if (!slug) {
    throw new Error(
      'Preflight cannot start: PREFLIGHT_CTRADER_SLUG is not set. ' +
        'Copy .env.example to .env and add your cTrader trading-profile slug ' +
        '(cTrader Web -> Settings -> Remote MCP).',
    );
  }

  const envMode = env.PREFLIGHT_MODE;
  if (envMode && envMode !== 'observe' && envMode !== 'enforce') {
    throw new Error(
      `Preflight cannot start: PREFLIGHT_MODE="${envMode}" is not valid. ` +
        `Use "observe" (forward everything, log what would be blocked) or ` +
        `"enforce" (a DENY stops the order).`,
    );
  }

  return {
    slug,
    url: env.PREFLIGHT_CTRADER_URL ?? 'https://mcp.ctrader.com/trading/mcp',
    mode: (envMode as Mode) ?? policy.mode ?? 'observe',
  };
}
