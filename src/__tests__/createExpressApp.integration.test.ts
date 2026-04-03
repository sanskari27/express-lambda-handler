import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@codegenie/serverless-express', () => ({
	getCurrentInvoke: () => ({ event: { requestContext: {} } }),
	default: vi.fn(),
}));

import { callback, createExpressApp } from '../createExpressApp';
import { HttpResponse } from '../httpResponse';
import { LambdaError } from '../lambdaError';
import { ERROR_TYPE } from '../types';

describe('createExpressApp (integration)', () => {
	it('exposes actuator by default', async () => {
		const router = Router();
		const app = createExpressApp(router);
		const res = await request(app).get('/actuator/health');
		expect(res.status).toBe(200);
	});

	it('hides actuator when actuator: false', async () => {
		const router = Router();
		const app = createExpressApp(router, [], { actuator: false });
		const res = await request(app).get('/actuator/health');
		expect(res.status).toBe(404);
	});

	it('respects custom actuator basePath', async () => {
		const router = Router();
		const app = createExpressApp(router, [], { actuator: { basePath: '/ops' } });
		const res = await request(app).get('/ops/health');
		expect(res.status).toBe(200);
	});

	it('returns 413 when JSON body exceeds jsonLimit', async () => {
		const router = Router();
		router.post('/big', (_req, res) => {
			HttpResponse.ok(res);
		});
		const app = createExpressApp(router, [], { jsonLimit: '200b' });
		const large = JSON.stringify({ x: 'y'.repeat(500) });
		const res = await request(app).post('/big').set('Content-Type', 'application/json').send(large);
		expect(res.status).toBe(413);
	});

	it('invokes logger after response', async () => {
		const logs: { statusCode: number }[] = [];
		const router = Router();
		router.get('/x', (_req, res) => HttpResponse.ok(res, { ok: true }));
		const app = createExpressApp(router, [], {
			logger: (info) => logs.push({ statusCode: info.statusCode }),
		});
		await request(app).get('/x');
		expect(logs.length).toBe(1);
		expect(logs[0].statusCode).toBe(200);
	});

	it('routes LambdaError types through the error handler', async () => {
		const router = Router();
		router.get('/e400', () => {
			throw new LambdaError('bad', { code: 'X', type: ERROR_TYPE.VALIDATION_ERROR });
		});
		router.get('/e401', () => {
			throw new LambdaError('bad', { code: 'X', type: ERROR_TYPE.UNAUTHORIZED_ERROR });
		});
		router.get('/e500', () => {
			throw new LambdaError('bad', { code: 'X', type: ERROR_TYPE.INTERNAL_SERVER_ERROR });
		});
		const app = createExpressApp(router);
		expect((await request(app).get('/e400')).status).toBe(400);
		expect((await request(app).get('/e401')).status).toBe(401);
		expect((await request(app).get('/e500')).status).toBe(500);
	});

	it('callback with router returns JSON body', async () => {
		const router = Router();
		router.get(
			'/cb',
			callback(
				(req) => ({ q: String(req.query.q ?? '') }),
				(d) => d.q.length > 0,
				async (d) => ({ message: d.q }),
			),
		);
		const app = createExpressApp(router);
		const res = await request(app).get('/cb').query({ q: 'hi' });
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ message: 'hi' });
	});
});
