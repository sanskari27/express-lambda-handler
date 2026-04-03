# express-lambda-handler

Run [Express](https://expressjs.com/) on **AWS Lambda** with helpers for a **parse → validate → handler** pipeline, consistent JSON error responses, and optional CORS, security headers, and Zod validation.

## Install

```bash
npm install @sanskari27/express-lambda-handler express
```

Peer dependencies: `express` ^4.18 or ^5. Optional: `@types/aws-lambda`, `helmet`, `zod` (see below).

## How to use

1. **Install** the package and `express` (and optional peers above).
2. **Choose how Lambda invokes Express** — see the table below. Most API Gateway setups use **`httpHandler`**.
3. **Build routes** with `Router()` (or reuse an existing `Application` if you use `createLambdaHandler`).
4. **Attach middleware** — pass global middleware as the second argument to `httpHandler(router, middlewares, options)` (for example CORS or Helmet from this package).
5. **Export** the returned function as your Lambda handler in CDK, SAM, Serverless Framework, etc.

| Export                    | Use when                                                                                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`httpHandler`**         | You want **API Gateway + Lambda** with `@codegenie/serverless-express`: binary response types, `getCurrentInvoke()` for the **`callback`** helper (authorizer context), and X-Ray HTTPS capture is applied for the process. |
| **`createLambdaHandler`** | You already have a full Express `Application` and only need **`serverless-http`**—no `getCurrentInvoke()`, no `callback` authorizer wiring.                                                                                 |
| **`createExpressApp`**    | You want the same JSON/body/error stack as `httpHandler` but as a plain Express `Application` (for example **integration tests** with `supertest`, or custom hosting).                                                      |

### API Gateway handler (`httpHandler`)

`httpHandler` wraps `createExpressApp` and returns an `APIGatewayProxyHandler`. Use it as the **exported handler** for API Gateway HTTP APIs or REST APIs.

```ts
import { Router } from 'express';
import { httpHandler, HttpResponse } from '@sanskari27/express-lambda-handler';

const router = Router();
router.get('/health', (_req, res) => HttpResponse.ok(res, { ok: true }));

export const handler = httpHandler(router);
```

Optional **global** middleware (CORS, security headers, etc.) and **options** (body limit, logging, actuator, binary types):

```ts
import { getCorsMiddleware, httpHandler } from '@sanskari27/express-lambda-handler';

export const handler = httpHandler(router, [getCorsMiddleware({ origin: true })], {
	jsonLimit: '2mb',
	actuator: false,
});
```

### Existing Express app (`createLambdaHandler`)

If you already call `express()` and mount routes on an `Application`, pass that app to **`createLambdaHandler`** instead of `httpHandler`. You will not get `getCurrentInvoke()`-based **`callback`** authorizer context (see table).

```ts
import express from 'express';
import { createLambdaHandler } from '@sanskari27/express-lambda-handler';

const app = express();
app.get('/health', (_req, res) => res.json({ ok: true }));

export const handler = createLambdaHandler(app, {
	binaryContentTypes: ['application/pdf', 'image/png'],
});
```

### Local or custom HTTP server (`createExpressApp`)

Use **`createExpressApp(router, middlewares?, options?)`** when you need the same middleware stack (JSON parser, error handler, optional actuator) **outside** Lambda—for example HTTP tests (add [`supertest`](https://github.com/ladjs/supertest) as a dev dependency):

```ts
import request from 'supertest';
import { Router } from 'express';
import { createExpressApp, HttpResponse } from '@sanskari27/express-lambda-handler';

const router = Router();
router.get('/health', (_req, res) => HttpResponse.ok(res, { ok: true }));

const app = createExpressApp(router);
// inside an async test (Vitest, Jest, …)
await request(app).get('/health').expect(200);
```

## Quick start (`httpHandler`)

```ts
import { Router } from 'express';
import { callback, httpHandler, HttpResponse } from '@sanskari27/express-lambda-handler';

const router = Router();

router.get('/health', (_req, res) => {
	HttpResponse.ok(res, { ok: true });
});

router.get(
	'/hello',
	callback(
		(req) => ({ name: String(req.query.name ?? '') }),
		(data) => data.name.length > 0,
		async (data) => ({ message: `Hello, ${data.name}` }),
	),
);

export const handler = httpHandler(router);
```

`httpHandler(router, middlewares?, options?)` accepts optional **`HttpHandlerOptions`**: `actuator`, `jsonLimit`, `logger`, `binaryContentTypes`, etc.

## `callback` middleware

`callback(parse, validate, handler, responseConfig?)` runs:

1. **`parse(req, authContext)`** — `authContext` comes from API Gateway `event.requestContext.authorizer` via `getCurrentInvoke()` (undefined outside that adapter).
2. **`validate(data)`** — return `false` to trigger a validation error (`400`).
3. **`handler(data)`** — async business logic.
4. Optional **`responseConfig(body)`** — override status, headers, or body (`ResponseConfig`).

## Environment variables

| Variable                      | Effect                                                                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPRESS_LAMBDA_LOG_REQUESTS` | If `1` or `true`, logs each request **after** the response finishes (method, path, status, duration) to `console`. Ignored if you pass a custom `logger` in options. |

## Options (`ExpressAppOptions` / `HttpHandlerOptions`)

- **`actuator`** — `false` disables Spring-style `/actuator` routes; or `{ basePath?: string }` (default base path `/actuator`).
- **`jsonLimit`** — Max size for JSON and urlencoded bodies (default `'1mb'`).
- **`logger`** — `(info: RequestLogInfo) => void` for structured logging after each response (`method`, `path`, `statusCode`, `durationMs`, optional `requestId` from `x-request-id` or `x-amzn-request-id`).
- **`binaryContentTypes`** — (`httpHandler` / `createLambdaHandler` only) Content-Types treated as binary in Lambda responses (default `['application/pdf']`).

## Middleware helpers

- **`getCorsMiddleware(options)`** — wraps [`cors`](https://github.com/expressjs/cors).
- **`getSecurityHeadersMiddleware(options?)`** — wraps [`helmet`](https://helmetjs.github.io/) (install `helmet` as a dependency).

## Zod integration (optional)

Install `zod`, then import from the subpath:

```ts
import { callback } from '@sanskari27/express-lambda-handler';
import { zodParse, zodValidate } from '@sanskari27/express-lambda-handler/zod';
import { z } from 'zod';

const Body = z.object({ email: z.string().email() });

router.post(
	'/signup',
	callback(
		zodParse(Body, (req) => req.body),
		zodValidate(),
		async (data) => {
			return { ok: true, email: data.email };
		},
	),
);
```

Invalid input throws a **`LambdaError`** with `ERROR_TYPE.VALIDATION_ERROR` (HTTP 400).

## API surface

Main package exports: `createExpressApp`, `httpHandler`, `createLambdaHandler`, `callback`, `HttpResponse`, `LambdaError`, `isLambdaError`, `getCorsMiddleware`, `getSecurityHeadersMiddleware`, `ERROR_TYPE`, `STATUS_CODE`, types such as `Middleware`, `ExpressAppOptions`, `HttpHandlerOptions`, `RequestLogInfo`, `ResponseConfig`.

Subpath `@sanskari27/express-lambda-handler/zod`: `zodParse`, `zodValidate`.

## Notes

- **`httpHandler`** calls `AWSXRay.captureHTTPsGlobal(https)` once per Lambda instance load; it instruments outbound HTTPS for the process.
- **Actuator** exposes health/info endpoints; disable in production if you do not want them public (`actuator: false`).
- **Payload size** — requests over `jsonLimit` are rejected with HTTP **413** and body `{ "code": "PAYLOAD_TOO_LARGE" }`.

## License

MIT — see [LICENSE](./LICENSE).
