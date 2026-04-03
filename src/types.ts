export enum STATUS_CODE {
	OK = 200,
	CREATED = 201,
	NO_CONTENT = 204,
	BAD_REQUEST = 400,
	UNAUTHORIZED = 401,
	FORBIDDEN = 403,
	RESOURCE_NOT_FOUND = 404,
	UNPROCESSABLE_CONTENT = 422,
	METHOD_NOT_ALLOWED = 405,
	INTERNAL_SERVER_ERROR = 500,
}

export enum ERROR_TYPE {
	VALIDATION_ERROR = 'VALIDATION_ERROR',
	/** Missing or invalid credentials; maps to HTTP 401 */
	UNAUTHORIZED_ERROR = 'UNAUTHORIZED_ERROR',
	/** Authenticated but not allowed (e.g. wrong role); maps to HTTP 403 */
	AUTH_ERROR = 'AUTH_ERROR',
	RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
	UNPROCESSABLE_CONTENT = 'UNPROCESSABLE_CONTENT',
	INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

export interface ResponseConfig<TBody> {
	status?: STATUS_CODE.OK | STATUS_CODE.CREATED | STATUS_CODE.NO_CONTENT;
	headers?: Record<string, string>;
	/** When omitted, the handler return value is sent as the body */
	body?: TBody;
}
