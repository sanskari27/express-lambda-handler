import serverlessExpress, { getCurrentInvoke } from '@codegenie/serverless-express';
import type { APIGatewayProxyHandler } from 'aws-lambda';
import AWSXRay from 'aws-xray-sdk-core';
import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import expressActuator from 'express-actuator';
import https from 'https';
import { HttpResponse } from './httpResponse';
import { isLambdaError, LambdaError } from './lambdaError';
import { ERROR_TYPE, ResponseConfig, STATUS_CODE } from './types';

export interface Middleware {
	(req: Request, res: Response, next: NextFunction): void;
}

export interface RequestLogInfo {
	method: string;
	path: string;
	statusCode: number;
	durationMs: number;
	requestId?: string;
}

export interface ExpressAppOptions {
	/** Set to `false` to disable Spring-style actuator routes. */
	actuator?: false | { basePath?: string };
	/** Max body size for `express.json()` and `express.urlencoded()` (default `'1mb'`). */
	jsonLimit?: string;
	/** Called after each response finishes (status, duration, optional request id). */
	logger?: (info: RequestLogInfo) => void;
}

export interface HttpHandlerOptions extends ExpressAppOptions {
	/** Content-Types treated as binary in API Gateway responses (default `['application/pdf']`). */
	binaryContentTypes?: string[];
}

const shouldLogRequest =
	process.env.EXPRESS_LAMBDA_LOG_REQUESTS === '1' ||
	process.env.EXPRESS_LAMBDA_LOG_REQUESTS === 'true';

function getRequestId(req: Request): string | undefined {
	const h = req.headers;
	const rid = h['x-request-id'];
	const arid = h['x-amzn-request-id'];
	if (typeof rid === 'string') return rid;
	if (typeof arid === 'string') return arid;
	return undefined;
}

function requestLoggingMiddleware(log: (info: RequestLogInfo) => void): Middleware {
	return (req, res, next) => {
		const start = Date.now();
		res.on('finish', () => {
			log({
				method: req.method,
				path: req.path,
				statusCode: res.statusCode,
				durationMs: Date.now() - start,
				requestId: getRequestId(req),
			});
		});
		next();
	};
}

export function createExpressApp(
	router: Router,
	middlewares: Middleware[] = [],
	options?: ExpressAppOptions,
) {
	const jsonLimit = options?.jsonLimit ?? '1mb';
	const app = express();
	app.use(cookieParser());
	app.use(express.json({ limit: jsonLimit }));
	app.use(express.urlencoded({ extended: true, limit: jsonLimit }));

	if (options?.logger) {
		app.use(requestLoggingMiddleware(options.logger));
	} else if (shouldLogRequest) {
		app.use(
			requestLoggingMiddleware((info) => {
				console.log(
					`[express-lambda-handler] ${info.method} ${info.path} ${info.statusCode} ${info.durationMs}ms`,
				);
			}),
		);
	}

	const actuatorOpt = options?.actuator;
	if (actuatorOpt !== false) {
		const basePath =
			actuatorOpt && typeof actuatorOpt === 'object' && actuatorOpt.basePath
				? actuatorOpt.basePath
				: '/actuator';
		app.use(
			expressActuator({
				basePath,
				infoGitMode: 'simple',
				infoBuildOptions: undefined,
				infoDateFormat: 'YYYY-MM-DD HH:mm:ss',
			}),
		);
	}

	middlewares.forEach((middleware) => app.use(middleware));

	app.use(router);
	app.use(errorHandler);
	return app;
}

function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
	const bodyParserErr = err as Error & { status?: number; statusCode?: number; type?: string };
	if (
		bodyParserErr.status === 413 ||
		bodyParserErr.statusCode === 413 ||
		bodyParserErr.type === 'entity.too.large'
	) {
		res.status(413).send({ code: 'PAYLOAD_TOO_LARGE' });
		return;
	}
	if (isLambdaError(err)) {
		HttpResponse.error(res, err);
	} else {
		HttpResponse.internalServerError(res);
	}
}

/**
 * Express middleware factory: parse → validate → async handler, with optional response shaping.
 * Intended for use with {@link httpHandler} (`@codegenie/serverless-express`). It reads API Gateway
 * context via `getCurrentInvoke()`; outside that adapter (e.g. plain Express or `serverless-http`),
 * `authorizer` context passed to `parse` may be undefined.
 */
export const callback =
	<
		TData,
		TResult,
		TOptions extends { tBody?: unknown; tAuthContext?: unknown } = {
			tBody: TResult;
			tAuthContext: undefined;
		},
	>(
		parse: (
			request: Request,
			authContext: TOptions extends { tAuthContext: infer A } ? A : undefined,
		) => TData,
		validate: (data: TData) => boolean,
		handler: (data: TData) => Promise<TResult>,
		responseConfig?: (
			data: TResult,
		) => ResponseConfig<TOptions extends { tBody: infer B } ? B : TResult>,
	): RequestHandler =>
	async (
		_request: Request,
		_response: Response<TOptions extends { tBody: infer B } ? B : TResult>,
		_next: NextFunction,
	): Promise<void> => {
		try {
			const { event } = getCurrentInvoke();
			const authorizer = event?.requestContext?.authorizer;

			const data = parse(
				_request,
				authorizer as TOptions extends { tAuthContext: infer A } ? A : undefined,
			);

			const isValid = validate(data);
			if (!isValid) {
				throw new LambdaError('Invalid request', {
					code: 'VALIDATION_ERROR',
					type: ERROR_TYPE.VALIDATION_ERROR,
				});
			}

			const body = await handler(data);

			const config =
				responseConfig?.(body) ??
				({} as ResponseConfig<TOptions extends { tBody: infer B } ? B : TResult>);
			const { status, headers, body: responseConfigBody } = config;
			const responseBody = responseConfigBody ?? body;

			const isStatusOverridden = !!status;
			if (isStatusOverridden) {
				_response.status(status);
			}

			if (headers) {
				_response.set(headers);
			}

			if (isStatusOverridden && status === STATUS_CODE.NO_CONTENT) {
				HttpResponse.noContent(_response);
				return;
			}

			let fn;
			if (isStatusOverridden) {
				fn = HttpResponse.withPresetStatus;
			} else if (_request.method === 'POST') {
				fn = HttpResponse.created;
			} else {
				fn = HttpResponse.ok;
			}

			fn(_response, responseBody);
		} catch (error) {
			_next(error);
		}
	};

/**
 * API Gateway–style Lambda handler using `@codegenie/serverless-express` (X-Ray HTTP capture,
 * binary content types, and `getCurrentInvoke()` for {@link callback}).
 *
 * **Note:** calls `AWSXRay.captureHTTPsGlobal(https)` which instruments outbound HTTPS for the process.
 */
export const httpHandler = (
	router: Router,
	middlewares?: Middleware[],
	options?: HttpHandlerOptions,
): APIGatewayProxyHandler => {
	AWSXRay.captureHTTPsGlobal(https);
	const binaryTypes = options?.binaryContentTypes ?? ['application/pdf'];
	return serverlessExpress({
		app: createExpressApp(router, middlewares, options),
		binarySettings: {
			contentTypes: binaryTypes,
		},
	});
};
