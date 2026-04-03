import type { Request } from 'express';
import type { z } from 'zod';
import { ZodError, type ZodType } from 'zod';
import { LambdaError } from './lambdaError';
import { ERROR_TYPE } from './types';

/**
 * Build a `parse` function for {@link callback} that validates with Zod.
 * On failure, throws {@link LambdaError} with `ERROR_TYPE.VALIDATION_ERROR`.
 */
export function zodParse<TSchema extends ZodType>(
	schema: TSchema,
	extractor: (req: Request) => unknown,
): (req: Request, _authContext: unknown) => z.infer<TSchema> {
	return (req: Request) => {
		try {
			const raw = extractor(req);
			return schema.parse(raw);
		} catch (e) {
			if (e instanceof ZodError) {
				throw new LambdaError('Validation failed', {
					code: 'VALIDATION_ERROR',
					type: ERROR_TYPE.VALIDATION_ERROR,
					cause: e,
				});
			}
			throw e;
		}
	};
}

/** No-op validate step: Zod parsing happens in {@link zodParse}. */
export function zodValidate(): boolean {
	return true;
}
