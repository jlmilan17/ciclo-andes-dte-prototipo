import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createSimApp } from '../src/app.js';

describe('GET /mh-sim/health', () => {
  it('responde ok', async () => {
    const res = await request(createSimApp()).get('/mh-sim/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
