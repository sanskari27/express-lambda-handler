import { ERROR_TYPE } from './types';

export interface LambdaErrorOptions {
	code: string;
	cause?: unknown;
	type: ERROR_TYPE;
}

export class LambdaError extends Error {
	public readonly code: string;
	public readonly type: ERROR_TYPE;

	constructor(message: string, options: LambdaErrorOptions) {
		super(message, { cause: options.cause });
		this.name = this.constructor.name;
		this.code = options.code;
		this.type = options.type;

		Object.setPrototypeOf(this, new.target.prototype);

		Error.captureStackTrace?.(this, this.constructor);
	}
}

export const isLambdaError = (error: unknown): error is LambdaError => {
	return error instanceof LambdaError;
};
