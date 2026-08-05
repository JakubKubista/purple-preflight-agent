import type { CTraderClient, OrderIntent } from './domain.js';

/**
 * Minimal MCP client over streamable HTTP for the cTrader remote server.
 *
 * Hand-rolled rather than using the SDK's client because the wire protocol was
 * already proven by hand with curl during the design session: POST initialize,
 * read the Mcp-Session-Id response header, POST notifications/initialized, then
 * tools/call. Responses may arrive as JSON or as SSE-framed `data:` lines.
 *
 * This class holds the `trading` slug. It is the only thing in the process that
 * can mutate the account, and the agent never sees it.
 */
export class RemoteCTraderClient implements CTraderClient {
  private sessionId: string | undefined;
  private nextId = 1;

  constructor(
    private readonly url: string,
    private readonly slug: string,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.slug}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.sessionId) h['Mcp-Session-Id'] = this.sessionId;
    return h;
  }

  /** Handshake. Safe to call repeatedly; only the first call does work. */
  async connect(): Promise<void> {
    if (this.sessionId) return;

    const res = await fetch(this.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextId++,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'preflight', version: '0.1.0' },
        },
      }),
    });

    if (!res.ok) {
      throw new Error(
        `cTrader initialize failed: HTTP ${res.status}. ` +
          `Check PREFLIGHT_CTRADER_SLUG is a valid trading-profile token.`,
      );
    }

    this.sessionId = res.headers.get('mcp-session-id') ?? undefined;
    await res.text();

    await fetch(this.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.connect();

    const res = await fetch(this.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextId++,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });

    if (!res.ok) {
      throw new Error(`cTrader ${name} failed: HTTP ${res.status} ${await res.text()}`);
    }

    return parseMcpResponse(await res.text(), name);
  }

  async createOrder(intent: OrderIntent): Promise<unknown> {
    return this.callTool('create_order', intent as unknown as Record<string, unknown>);
  }
}

/**
 * The endpoint answers either bare JSON or SSE frames depending on the request,
 * so strip `data:` prefixes before parsing. Tool payloads arrive as a JSON string
 * inside content[0].text rather than as structured content.
 */
export function parseMcpResponse(raw: string, toolName: string): unknown {
  const body = raw
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('event:'))
    .map((l) => (l.startsWith('data: ') ? l.slice(6) : l))
    .join('');

  const envelope = JSON.parse(body) as {
    error?: { message?: string };
    result?: { content?: Array<{ text?: string }> };
  };

  if (envelope.error) {
    throw new Error(`cTrader ${toolName} error: ${envelope.error.message ?? 'unknown'}`);
  }

  const text = envelope.result?.content?.[0]?.text;
  if (text === undefined) return envelope.result;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
