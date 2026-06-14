import type { Instrumentation } from 'next';

import { captureException } from './app/lib/sentry';

/**
 * Server-side error observability. Next calls onRequestError for any error
 * thrown while handling a request (Server Components, route handlers, Server
 * Actions) across both the Node and Edge runtimes. We forward it to Sentry
 * (a no-op when no DSN is configured).
 *
 * Caught-and-handled errors (e.g. the /api/submissions try/catch that returns
 * a 500) don't reach here — those call captureException explicitly. This
 * catches the uncaught ones.
 */
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  captureException(err, {
    tags: { route_type: context.routeType },
    extra: { path: request.path, method: request.method, routePath: context.routePath },
  });
};
