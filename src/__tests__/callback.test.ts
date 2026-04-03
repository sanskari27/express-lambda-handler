import { type NextFunction, type Request, type Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const { getCurrentInvoke } = vi.hoisted(() => ({
	getCurrentInvoke: vi.fn(),
}));

vi.mock('@codegenie/serverless-express', () => ({
	getCurrentInvoke,
	default: vi.fn(),
}));

import { callback } from '../createExpressApp';
import { LambdaError } from '../lambdaError';
import { ERROR_TYPE } from '../types';

describe('callback', () => {
	beforeEach(() => {
		getCurrentInvoke.mockReturnValue({
			event: {
				requestContext: {
					authorizer: { sub: 'u1' },
				},
			},
		});
	});

	it('runs parse → validate → handler and returns ok', async () => {
		const h = callback(
			(req, auth) => ({
				n: Number((req as unknown as { query: { n?: string } }).query.n),
				auth,
			}),
			z.object({ n: z.number().positive() }).passthrough(),
			async (d) => ({ sum: d.n + 1 }),
		);
		const req = { method: 'GET', path: '/', query: { n: '2' } } as unknown as Request;
		const calls: unknown[] = [];
		const res = {
			statusCode: 200,
			status(this: { statusCode: number; status: (n: number) => unknown }, n: number) {
				this.statusCode = n;
				return this;
			},
			send(b?: unknown) {
				calls.push({ send: b });
			},
			set: () => undefined,
		} as unknown as Response;
		const next = (e?: unknown) => calls.push({ next: e });
		await h(req, res, next as NextFunction);
		expect(calls).toEqual([{ send: { sum: 3 } }]);
		expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
	});

	it('calls next with LambdaError when Zod validation fails', async () => {
		const h = callback(
			() => ({ x: 1 }),
			z.object({ x: z.literal(2) }),
			async () => ({}),
		);
		const req = { method: 'GET', path: '/' } as Request;
		const calls: unknown[] = [];
		const res = {
			statusCode: 200,
			status(this: { statusCode: number; status: (n: number) => unknown }, n: number) {
				this.statusCode = n;
				return this;
			},
			send: () => undefined,
			set: () => undefined,
		} as unknown as Response;
		const next = (e?: unknown) => calls.push(e);
		await h(req, res, next as NextFunction);
		expect(calls[0]).toBeInstanceOf(LambdaError);
		expect((calls[0] as LambdaError).type).toBe(ERROR_TYPE.VALIDATION_ERROR);
	});

	it('uses created for POST when status not overridden', async () => {
		const h = callback(
			() => ({}),
			z.object({}),
			async () => ({ id: 1 }),
		);
		const req = { method: 'POST', path: '/' } as Request;
		const res = {
			statusCode: 200,
			status(this: { statusCode: number; status: (n: number) => unknown }, n: number) {
				this.statusCode = n;
				return this;
			},
			send: () => undefined,
			set: () => undefined,
		} as unknown as Response;
		await h(req, res, (() => undefined) as NextFunction);
		expect((res as unknown as { statusCode: number }).statusCode).toBe(201);
	});

	it('uses noContent when responseConfig sets 204', async () => {
		const h = callback(
			() => ({}),
			z.object({}),
			async () => undefined,
			() => ({ status: 204 as const }),
		);
		const req = { method: 'GET', path: '/' } as Request;
		let ended = false;
		const res = {
			statusCode: 200,
			status(this: { statusCode: number; status: (n: number) => unknown }, n: number) {
				this.statusCode = n;
				return this;
			},
			send: () => {
				throw new Error('should not send body for 204');
			},
			end() {
				ended = true;
			},
			set: () => undefined,
		} as unknown as Response;
		await h(req, res, (() => undefined) as NextFunction);
		expect((res as unknown as { statusCode: number }).statusCode).toBe(204);
		expect(ended).toBe(true);
	});
});
