import express, { type Response } from 'express';
import { describe, expect, it } from 'vitest';
import { HttpResponse, codesMap } from '../httpResponse';
import { LambdaError } from '../lambdaError';
import { ERROR_TYPE, STATUS_CODE } from '../types';

function mockRes(): Response {
	const res = express.response as Response;
	res.status = ((code: number) => {
		(res as unknown as { statusCode: number }).statusCode = code;
		return res;
	}) as Response['status'];
	res.send = ((body?: unknown) => {
		(res as unknown as { body: unknown }).body = body;
		return res;
	}) as Response['send'];
	res.end = (() => res) as Response['end'];
	res.set = (() => res) as Response['set'];
	return res;
}

describe('HttpResponse', () => {
	it('maps every STATUS_CODE used in codesMap', () => {
		expect(codesMap.get(STATUS_CODE.OK)).toBeDefined();
		expect(codesMap.get(STATUS_CODE.CREATED)).toBeDefined();
		expect(codesMap.get(STATUS_CODE.NO_CONTENT)).toBeDefined();
		expect(codesMap.get(STATUS_CODE.BAD_REQUEST)).toBeDefined();
	});

	it('ok sends 200 and default code', () => {
		const res = mockRes();
		HttpResponse.ok(res);
		expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
		expect((res as unknown as { body: { code: string } }).body).toEqual({ code: 'SUCCESS' });
	});

	it('created sends 201', () => {
		const res = mockRes();
		HttpResponse.created(res, { id: 1 });
		expect((res as unknown as { statusCode: number }).statusCode).toBe(201);
		expect((res as unknown as { body: unknown }).body).toEqual({ id: 1 });
	});

	it('noContent sends 204 with no body', () => {
		const res = mockRes();
		let ended = false;
		res.end = ((cb?: () => void) => {
			ended = true;
			cb?.();
			return res;
		}) as Response['end'];
		HttpResponse.noContent(res);
		expect((res as unknown as { statusCode: number }).statusCode).toBe(204);
		expect(ended).toBe(true);
	});

	it('error dispatches LambdaError types', () => {
		const cases: { err: Error; expectedStatus: number }[] = [
			{
				err: new LambdaError('v', { code: 'E', type: ERROR_TYPE.VALIDATION_ERROR }),
				expectedStatus: 400,
			},
			{
				err: new LambdaError('u', { code: 'E', type: ERROR_TYPE.UNAUTHORIZED_ERROR }),
				expectedStatus: 401,
			},
			{
				err: new LambdaError('a', { code: 'E', type: ERROR_TYPE.AUTH_ERROR }),
				expectedStatus: 403,
			},
			{
				err: new LambdaError('n', { code: 'E', type: ERROR_TYPE.RESOURCE_NOT_FOUND }),
				expectedStatus: 404,
			},
			{
				err: new LambdaError('p', { code: 'E', type: ERROR_TYPE.UNPROCESSABLE_CONTENT }),
				expectedStatus: 422,
			},
			{
				err: new LambdaError('i', { code: 'E', type: ERROR_TYPE.INTERNAL_SERVER_ERROR }),
				expectedStatus: 500,
			},
		];
		for (const { err, expectedStatus } of cases) {
			const res = mockRes();
			HttpResponse.error(res, err);
			expect((res as unknown as { statusCode: number }).statusCode).toBe(expectedStatus);
		}
	});

	it('error maps generic Error with ERROR_TYPE cause string', () => {
		const res = mockRes();
		const err = new Error('x', { cause: ERROR_TYPE.VALIDATION_ERROR });
		HttpResponse.error(res, err);
		expect((res as unknown as { statusCode: number }).statusCode).toBe(400);
	});

	it('error defaults to 500 for unknown errors', () => {
		const res = mockRes();
		HttpResponse.error(res, new Error('?'));
		expect((res as unknown as { statusCode: number }).statusCode).toBe(500);
	});
});
