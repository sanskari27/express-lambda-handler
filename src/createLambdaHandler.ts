import type { Application } from 'express';
import serverless from 'serverless-http';

/**
 * Wraps an Express `Application` as a Lambda handler via `serverless-http`.
 *
 * Use this when you already have a full `Application` and do not need
 * {@link createExpressApp}, {@link httpHandler}, or {@link callback} (which rely on
 * `@codegenie/serverless-express` and `getCurrentInvoke()`).
 */
export function createLambdaHandler(app: Application) {
	return serverless(app);
}
