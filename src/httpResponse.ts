import type { Response } from 'express';
import { isLambdaError } from './lambdaError';
import { ERROR_TYPE, STATUS_CODE } from './types';

enum DEFAULT_CODE {
	SUCCESS = 'SUCCESS',
	CREATED = 'CREATED',
	NO_CONTENT = 'NO_CONTENT',
	BAD_REQUEST = 'BAD_REQUEST',
	UNAUTHORIZED = 'UNAUTHORIZED',
	FORBIDDEN = 'FORBIDDEN',
	RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
	UNPROCESSABLE_CONTENT = 'UNPROCESSABLE_CONTENT',
	INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

export const codesMap: Map<STATUS_CODE, DEFAULT_CODE> = new Map([
	[STATUS_CODE.OK, DEFAULT_CODE.SUCCESS],
	[STATUS_CODE.CREATED, DEFAULT_CODE.CREATED],
	[STATUS_CODE.NO_CONTENT, DEFAULT_CODE.NO_CONTENT],
	[STATUS_CODE.BAD_REQUEST, DEFAULT_CODE.BAD_REQUEST],
	[STATUS_CODE.UNAUTHORIZED, DEFAULT_CODE.UNAUTHORIZED],
	[STATUS_CODE.FORBIDDEN, DEFAULT_CODE.FORBIDDEN],
	[STATUS_CODE.RESOURCE_NOT_FOUND, DEFAULT_CODE.RESOURCE_NOT_FOUND],
	[STATUS_CODE.UNPROCESSABLE_CONTENT, DEFAULT_CODE.UNPROCESSABLE_CONTENT],
	[STATUS_CODE.INTERNAL_SERVER_ERROR, DEFAULT_CODE.INTERNAL_SERVER_ERROR],
]);

function resolveErrorType(error: Error): ERROR_TYPE | undefined {
	if (isLambdaError(error)) {
		return error.type;
	}
	const { cause } = error;
	if (typeof cause === 'string' && Object.values(ERROR_TYPE).includes(cause as ERROR_TYPE)) {
		return cause as ERROR_TYPE;
	}
	return undefined;
}

export class HttpResponse {
	static ok<TBody>(response: Response, body?: TBody) {
		const code = codesMap.get(STATUS_CODE.OK)!;
		response.status(STATUS_CODE.OK).send(body || { code });
	}

	static created<TBody>(response: Response, body?: TBody) {
		const code = codesMap.get(STATUS_CODE.CREATED)!;
		response.status(STATUS_CODE.CREATED).send(body || { code });
	}

	/** 204 No Content — no response body (RFC 7231). */
	static noContent(response: Response) {
		response.status(STATUS_CODE.NO_CONTENT).end();
	}

	static withPresetStatus<TBody>(response: Response, body?: TBody) {
		response.send(body);
	}

	static badRequest(response: Response, errorCode?: string) {
		const code = errorCode || codesMap.get(STATUS_CODE.BAD_REQUEST)!;
		response.status(STATUS_CODE.BAD_REQUEST).send({ code });
	}

	static unauthorized(response: Response, errorCode?: string) {
		const code = errorCode || codesMap.get(STATUS_CODE.UNAUTHORIZED)!;
		response.status(STATUS_CODE.UNAUTHORIZED).send({ code });
	}

	static forbidden(response: Response, errorCode?: string) {
		const code = errorCode || codesMap.get(STATUS_CODE.FORBIDDEN)!;
		response.status(STATUS_CODE.FORBIDDEN).send({ code });
	}

	static resourceNotFound(response: Response, errorCode?: string) {
		const code = errorCode || codesMap.get(STATUS_CODE.RESOURCE_NOT_FOUND)!;
		response.status(STATUS_CODE.RESOURCE_NOT_FOUND).send({ code });
	}

	static unprocessableContent(response: Response, errorCode?: string) {
		const code = errorCode || codesMap.get(STATUS_CODE.UNPROCESSABLE_CONTENT)!;
		response.status(STATUS_CODE.UNPROCESSABLE_CONTENT).send({ code });
	}

	static internalServerError(response: Response, errorCode?: string) {
		const code = errorCode || codesMap.get(STATUS_CODE.INTERNAL_SERVER_ERROR)!;
		response.status(STATUS_CODE.INTERNAL_SERVER_ERROR).send({ code });
	}

	static error(response: Response, error: Error) {
		const errorType = resolveErrorType(error);
		const errorCode = isLambdaError(error) ? error.code : undefined;

		let errorResponse: (response: Response, errorCode?: string) => void;
		switch (errorType) {
			case ERROR_TYPE.VALIDATION_ERROR:
				errorResponse = HttpResponse.badRequest;
				break;
			case ERROR_TYPE.UNAUTHORIZED_ERROR:
				errorResponse = HttpResponse.unauthorized;
				break;
			case ERROR_TYPE.AUTH_ERROR:
				errorResponse = HttpResponse.forbidden;
				break;
			case ERROR_TYPE.RESOURCE_NOT_FOUND:
				errorResponse = HttpResponse.resourceNotFound;
				break;
			case ERROR_TYPE.UNPROCESSABLE_CONTENT:
				errorResponse = HttpResponse.unprocessableContent;
				break;
			default:
				errorResponse = HttpResponse.internalServerError;
				break;
		}
		errorResponse(response, errorCode);
	}
}
