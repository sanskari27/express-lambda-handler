import type { Application } from 'express';
import serverless from 'serverless-http';

export interface CreateLambdaHandlerOptions {
	/** Content-Types passed to `serverless-http` as binary (see `serverless-http` `binary` option). */
	binaryContentTypes?: string[];
}

/**
 * Wraps an Express `Application` as a Lambda handler via `serverless-http`.
 *
 * Use this when you already have a full `Application` and do not need
 * {@link createExpressApp}, {@link httpHandler}, or {@link callback} (which rely on
 * `@codegenie/serverless-express` and `getCurrentInvoke()`).
 */
export function createLambdaHandler(app: Application, options?: CreateLambdaHandlerOptions) {
	const binary = options?.binaryContentTypes;
	return serverless(app, binary && binary.length > 0 ? { binary } : undefined);
}
