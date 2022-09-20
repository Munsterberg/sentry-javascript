// We import these types from `withSentry` rather than directly from `next` because our version can work simultaneously
// with multiple versions of next. See note in `withSentry` for more.
import type { NextApiHandler, WrappedNextApiHandler } from '../../utils/withSentry';
import { withSentry } from '../../utils/withSentry';

/**
 * Wrap the given API route handler for tracing and error capturing. Thin wrapper around `withSentry`, which only
 * applies it if it hasn't already been applied.
 *
 * @param maybeWrappedHandler The handler exported from the user's API page route file, which may or may not already be
 * wrapped with `withSentry`
 * @param parameterizedRoute The page's route, passed in via the proxy loader
 * @returns
 */
export function withSentryAPI(
  maybeWrappedHandler: NextApiHandler | WrappedNextApiHandler,
  parameterizedRoute: string,
): WrappedNextApiHandler {
  // We want the innards of `withSentry` to have access to the parameterized route, so it can be used when we start the
  // request transaction. If we were always the ones calling `withSentry` (the way we're always the ones to call
  // `withSentryServerSideProps`, for example), then we could just pass it in as a second parameter and know it would
  // always be there. But in the case where users have already manually wrapped their API route handlers with
  // `withSentry`, they're the ones calling it, without the parameterized route as a second parameter. We therefore need
  // a different way to make it available, which we'll do by storing it on the handler or handler wrapper, depending on
  // what we're given.
  maybeWrappedHandler.__sentry_route__ = parameterizedRoute;

  // In the simple case, where the handler has not yet been wrapped, `maybeWrappedHandler` will be passed to
  // `withSentry` as `origHandler` and so the parameterized route will be easy to access.
  if (!('__sentry_wrapped__' in maybeWrappedHandler)) {
    return withSentry(maybeWrappedHandler);
  }

  // In the case where the exported handler is already of the form `withSentry(origHandler)`, `maybeWrappedHandler` is
  // the wrapped handler returned by `withSentry`, which now has the parameterized route as a property on itself. By
  // default in JS, functions have `global` as their `this` value, so to be able to get at the route value, we need to
  // make sure it's called with itself as `this`. Since ultimately we need to give nextjs something *it* will call (and
  // it won't set the `this` value we want when it does), this means one more wrapper.
  const newWrapper: WrappedNextApiHandler = (req, res) => {
    // Make `maybeyWrappedHandler` its own `this`
    return maybeWrappedHandler.call(maybeWrappedHandler, req, res);
  };

  return newWrapper;
}
