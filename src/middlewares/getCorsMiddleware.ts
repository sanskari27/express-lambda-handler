import cors from 'cors';

export function getCorsMiddleware(corsOptions: cors.CorsOptions | cors.CorsOptionsDelegate) {
	return cors(corsOptions);
}
