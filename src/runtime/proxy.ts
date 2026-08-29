import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ApolloRequestObservation } from '../core/types.js';

function authType(headers: IncomingHttpHeaders): 'none' | 'bearer' | 'cookie' | 'other' {
  if (headers.authorization?.startsWith('Bearer ')) return 'bearer';
  if (headers.authorization) return 'other';
  if (headers.cookie) return 'cookie';
  return 'none';
}

export async function startObservationProxy(target: string, observation: ApolloRequestObservation): Promise<{ url: string; close(): Promise<void> }> {
  const server: Server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (value !== undefined && !['host', 'content-length'].includes(key)) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    let status = 502;
    try {
      const upstream = await fetch(`${target}${request.url ?? '/'}`, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method ?? 'GET') ? undefined : Buffer.concat(chunks), redirect: 'manual' });
      status = upstream.status;
      response.statusCode = upstream.status;
      upstream.headers.forEach((value, key) => { if (!['transfer-encoding', 'content-encoding', 'content-length'].includes(key)) response.setHeader(key, value); });
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      response.statusCode = 502;
      response.end(String(error));
    } finally {
      observation.records.push({ timestamp: new Date().toISOString(), method: request.method ?? 'GET', path: request.url ?? '/', status, userAgent: request.headers['user-agent'], authType: authType(request.headers) });
    }
  });
  await new Promise<void>((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, close: async () => await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}
