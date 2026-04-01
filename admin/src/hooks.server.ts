// import type { Handle } from '@sveltejs/kit';
// import { env } from '$env/dynamic/private';

// const BASIC_AUTH_USER = env.BASIC_AUTH_USER;
// const BASIC_AUTH_PASSWORD = env.BASIC_AUTH_PASSWORD;

// export const handle: Handle = async ({ event, resolve }) => {
// 	if (!BASIC_AUTH_USER || !BASIC_AUTH_PASSWORD) {
// 		return resolve(event);
// 	}

// 	const auth = event.request.headers.get('Authorization');

// 	if (auth) {
// 		const [scheme, encoded] = auth.split(' ');
// 		if (scheme === 'Basic') {
// 			const decoded = atob(encoded);
// 			const [user, password] = decoded.split(':');
// 			if (user === BASIC_AUTH_USER && password === BASIC_AUTH_PASSWORD) {
// 				return resolve(event);
// 			}
// 		}
// 	}

// 	return new Response('Unauthorized', {
// 		status: 401,
// 		headers: {
// 			'WWW-Authenticate': 'Basic realm="Protected"'
// 		}
// 	});
// };
