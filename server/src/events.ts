import type { ServerResponse } from 'node:http';

/** Cloudflare drops a stream that stays idle for 100s, so comment lines keep it open. */
const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events hub. Events only say "something changed"; clients then do a normal pull,
 * so a missed event costs nothing.
 */
export class EventHub {
  private readonly clients = new Set<ServerResponse>();
  private readonly heartbeat = setInterval(() => this.write(': ping\n\n'), HEARTBEAT_MS);

  constructor() {
    this.heartbeat.unref();
  }

  get size(): number {
    return this.clients.size;
  }

  add(res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      // no-transform stops proxies from compressing, and so buffering, the stream.
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('event: ready\ndata: {}\n\n');
    this.clients.add(res);
    res.on('close', () => this.clients.delete(res));
  }

  publish(seq: number): void {
    this.write(`event: change\ndata: ${JSON.stringify({ seq })}\n\n`);
  }

  close(): void {
    clearInterval(this.heartbeat);
    for (const res of this.clients) res.end();
    this.clients.clear();
  }

  private write(chunk: string): void {
    for (const res of this.clients) res.write(chunk);
  }
}
