import { type Request } from 'express';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodParse, zodValidate } from '../zod';
import { isLambdaError } from '../lambdaError';
import { ERROR_TYPE } from '../types';

describe('zodParse / zodValidate', () => {
	const schema = z.object({ email: z.string().email() });

	it('returns parsed data when valid', () => {
		const parse = zodParse(schema, (req: Request) => req.body);
		const req = { body: { email: 'a@b.co' } } as Request;
		expect(parse(req, undefined)).toEqual({ email: 'a@b.co' });
	});

	it('throws LambdaError on Zod failure', () => {
		const parse = zodParse(schema, (req: Request) => req.body);
		const req = { body: { email: 'not-an-email' } } as Request;
		expect(() => parse(req, undefined)).toThrow();
		try {
			parse(req, undefined);
		} catch (e) {
			expect(isLambdaError(e)).toBe(true);
			expect((e as { type: string }).type).toBe(ERROR_TYPE.VALIDATION_ERROR);
		}
	});

	it('zodValidate always returns true', () => {
		expect(zodValidate()).toBe(true);
	});
});
