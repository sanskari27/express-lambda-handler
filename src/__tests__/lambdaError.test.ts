import { describe, expect, it } from 'vitest';
import { isLambdaError, LambdaError } from '../lambdaError';
import { ERROR_TYPE } from '../types';

describe('LambdaError', () => {
	it('sets code, type, message, and cause', () => {
		const cause = new Error('root');
		const err = new LambdaError('msg', {
			code: 'MY_CODE',
			type: ERROR_TYPE.VALIDATION_ERROR,
			cause,
		});
		expect(err.message).toBe('msg');
		expect(err.code).toBe('MY_CODE');
		expect(err.type).toBe(ERROR_TYPE.VALIDATION_ERROR);
		expect(err.cause).toBe(cause);
		expect(err.name).toBe('LambdaError');
	});

	it('isLambdaError narrows correctly', () => {
		expect(isLambdaError(new LambdaError('x', { code: 'c', type: ERROR_TYPE.AUTH_ERROR }))).toBe(
			true,
		);
		expect(isLambdaError(new Error('x'))).toBe(false);
	});
});
