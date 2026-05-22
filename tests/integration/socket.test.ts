import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { io as ioClient, type Socket } from 'socket.io-client';
import request from 'supertest';

let server: ChildProcess | undefined;
const BASE = 'http://localhost:3101';

async function waitForHealthy(url: string, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await wait(500);
  }
  throw new Error('server did not become healthy');
}

beforeAll(async () => {
  server = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3101' },
    shell: process.platform === 'win32',
  });
  await waitForHealthy(`${BASE}/api/tournaments`);
}, 60_000);

afterAll(async () => {
  if (server) {
    server.kill();
    await wait(500);
  }
});

describe('socket events', () => {
  it('subscribed client receives team.added when admin adds team', async () => {
    // login as admin and create tournament
    const loginRes = await request(BASE)
      .post('/api/admin/login')
      .send({ password: process.env.ADMIN_PASSWORD || 'dev-password-please-change' });
    const cookie = (loginRes.headers['set-cookie'][0] as string).split(';')[0];

    const tRes = await request(BASE)
      .post('/api/tournaments')
      .set('Cookie', cookie)
      .send({ name: 'socket-test', teamsPerGroup: 4 });
    const tournamentId = tRes.body.id;

    // subscribe via socket
    const socket: Socket = ioClient(BASE, { path: '/socket.io/' });
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    const received: any[] = [];
    socket.on('team.added', (payload) => received.push(payload));
    socket.emit('subscribe', { tournamentId });
    await wait(100);

    // add a team via API
    await request(BASE)
      .post(`/api/tournaments/${tournamentId}/teams`)
      .set('Cookie', cookie)
      .send({ name: 'X', player1Name: 'p1', player2Name: 'p2', seedLevel: 3 });

    await wait(200);
    expect(received.length).toBe(1);
    expect(received[0].team.name).toBe('X');

    // cleanup
    socket.disconnect();
    await request(BASE).delete(`/api/tournaments/${tournamentId}`).set('Cookie', cookie);
  }, 20_000);
});
