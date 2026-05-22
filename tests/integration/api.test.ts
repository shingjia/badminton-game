import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import request from 'supertest';

let server: ChildProcess | undefined;
const BASE = 'http://localhost:3100';

async function waitForHealthy(url: string, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // ignore
    }
    await wait(500);
  }
  throw new Error('server did not become healthy');
}

beforeAll(async () => {
  // assume docker compose stack is up; otherwise skip
  server = spawn('npm', ['run', 'dev', '--', '-p', '3100'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3100' },
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

describe('full tournament flow (smoke)', () => {
  let cookie = '';
  let tournamentId = '';

  it('logs in as admin', async () => {
    const res = await request(BASE)
      .post('/api/admin/login')
      .send({ password: process.env.ADMIN_PASSWORD || 'dev-password-please-change' });
    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeTruthy();
    cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0];
  });

  it('creates a tournament', async () => {
    const res = await request(BASE)
      .post('/api/tournaments')
      .set('Cookie', cookie)
      .send({ name: 'smoke-test', teamsPerGroup: 4 });
    expect(res.status).toBe(201);
    tournamentId = res.body.id;
  });

  it('adds 8 teams and 2 courts', async () => {
    for (let i = 1; i <= 8; i++) {
      const r = await request(BASE)
        .post(`/api/tournaments/${tournamentId}/teams`)
        .set('Cookie', cookie)
        .send({
          name: `T${i}`,
          player1Name: `P${i}-1`,
          player2Name: `P${i}-2`,
          seedLevel: ((i - 1) % 5) + 1,
        });
      expect(r.status).toBe(201);
    }
    for (let i = 1; i <= 2; i++) {
      const r = await request(BASE)
        .post(`/api/tournaments/${tournamentId}/courts`)
        .set('Cookie', cookie)
        .send({ name: `場地 ${i}` });
      expect(r.status).toBe(201);
    }
  });

  it('generates groups, locks, generates matches', async () => {
    const g = await request(BASE).post(`/api/tournaments/${tournamentId}/groups/generate`).set('Cookie', cookie);
    expect(g.status).toBe(200);
    expect(g.body.groups.length).toBe(2); // 8 teams / 4

    const l = await request(BASE).post(`/api/tournaments/${tournamentId}/groups/lock`).set('Cookie', cookie);
    expect(l.status).toBe(200);
    expect(l.body.status).toBe('in_progress');

    const m = await request(BASE).post(`/api/tournaments/${tournamentId}/matches/generate`).set('Cookie', cookie);
    expect(m.status).toBe(200);
    // 2 groups × C(4,2)=6 matches = 12
    expect(m.body.count).toBe(12);
  });

  it('fills all scores and reaches finished', async () => {
    const matches = (await request(BASE).get(`/api/tournaments/${tournamentId}/matches`)).body;
    for (const mch of matches) {
      const r = await request(BASE)
        .patch(`/api/matches/${mch.id}/score`)
        .set('Cookie', cookie)
        .send({ scoreA: 21, scoreB: 15 });
      expect(r.status).toBe(200);
    }
    const t = (await request(BASE).get(`/api/tournaments/${tournamentId}`)).body;
    expect(t.status).toBe('finished');
  });

  it('returns standings', async () => {
    const s = await request(BASE).get(`/api/tournaments/${tournamentId}/standings`);
    expect(s.status).toBe(200);
    expect(Array.isArray(s.body)).toBe(true);
    expect(s.body.length).toBe(2); // 2 groups
    for (const group of s.body) {
      expect(group.standings.length).toBe(4); // 4 teams per group
      // ranks should be 1..4 (no ties expected since one team won all)
      const ranks = group.standings.map((r: any) => r.rank).sort();
      expect(ranks[0]).toBe(1);
    }
  });

  it('cleanup', async () => {
    const d = await request(BASE).delete(`/api/tournaments/${tournamentId}`).set('Cookie', cookie);
    expect(d.status).toBe(200);
  });
});
