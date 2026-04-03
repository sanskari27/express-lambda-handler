import serverlessExpress, { getCurrentInvoke } from '@codegenie/serverless-express';
import type { APIGatewayProxyHandler } from 'aws-lambda';
import AWSXRay from 'aws-xray-sdk-core';
import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import expressActuator from 'express-actuator';
import https from 'https';
import { HttpResponse } from './httpResponse';
import { isLambdaError } from './lambdaError';
import { ERROR_TYPE, ResponseConfig } from './types';

export interface Middleware {
	(req: Request, res: Response, next: NextFunction): void;
}

const shouldLogRequest =
	process.env.EXPRESS_LAMBDA_LOG_REQUESTS === '1' ||
	process.env.EXPRESS_LAMBDA_LOG_REQUESTS === 'true';

export function createExpressApp(router: Router, middlewares: Middleware[] = []) {
	const app = express();
	app.use(cookieParser());
	app.use(express.json());
	app.use(express.urlencoded({ extended: true, limit: '1mb' }));

	if (shouldLogRequest) {
		app.use((req: Request, res: Response, next: NextFunction) => {
			const { path, method } = req;
			console.log(`[express-lambda-handler] ${method} ${path}`);
			next();
		});
	}

	app.use(
		expressActuator({
			basePath: '/actuator',
			infoGitMode: 'simple',
			infoBuildOptions: undefined,
			infoDateFormat: 'YYYY-MM-DD HH:mm:ss',
		}),
	);

	middlewares.forEach((middleware) => app.use(middleware));

	app.use(router);
	app.use(errorHandler);
	return app;
}

function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
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
				throw new Error('Callback middleware, Invalid Request', {
					cause: ERROR_TYPE.VALIDATION_ERROR,
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
 */
export const httpHandler = (router: Router, middlewares?: Middleware[]): APIGatewayProxyHandler => {
	AWSXRay.captureHTTPsGlobal(https);
	return serverlessExpress({
		app: createExpressApp(router, middlewares),
		binarySettings: {
			contentTypes: ['application/pdf'],
		},
	});
};
