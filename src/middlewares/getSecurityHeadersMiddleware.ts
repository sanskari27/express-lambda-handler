import type { RequestHandler } from 'express';
import helmet from 'helmet';

/**
 * Optional security headers via [`helmet`](https://helmetjs.github.io/).
 * Add `helmet` as a dependency when using this helper.
 */
export function getSecurityHeadersMiddleware(
	options?: Parameters<typeof helmet>[0],
): RequestHandler {
	return helmet(options);
}
