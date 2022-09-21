import { captureException, flush, getCurrentHub, startTransaction } from '@sentry/node';
import { extractTraceparentData, hasTracingEnabled } from '@sentry/tracing';
import { Transaction } from '@sentry/types';
import {
  addExceptionMechanism,
  baggageHeaderToDynamicSamplingContext,
  isString,
  logger,
  objectify,
  stripUrlQueryAndFragment,
} from '@sentry/utils';
import * as domain from 'domain';
import { NextApiRequest, NextApiResponse } from 'next';

// The `NextApiHandler` and `WrappedNextApiHandler` types are the same as the official `NextApiHandler` type, except:
//
// a) The wrapped version returns only promises, because wrapped handlers are always async.
//
// b) Instead of having a return types based on `void` (Next < 12.1.6) or `unknown` (Next 12.1.6+), both the wrapped and
// unwrapped versions of the type have both. This doesn't matter to users, because they exist solely on one side of that
// version divide or the other. For us, though, it's entirely possible to have one version of Next installed in our
// local repo (as a dev dependency) and have another Next version installed in a test app which also has the local SDK
// linked in.
//
// In that case, if those two versions are on either side of the 12.1.6 divide, importing the official `NextApiHandler`
// type here would break the test app's build, because it would set up a situation in which the linked SDK's
// `withSentry` would refer to one version of the type (from the local repo's `node_modules`) while any typed handler in
// the test app would refer to the other version of the type (from the test app's `node_modules`). By using a custom
// version of the type compatible with both the old and new official versions, we can use any Next version we want in a
// test app without worrying about type errors.
//
// c) These have internal SDK flags which the official Next types obviously don't have, one to allow our auto-wrapping
// function, `withSentryAPI`, to pass the parameterized route into `withSentry`, and the other to prevent a manually
// wrapped route from being wrapped again by the auto-wrapper.

export type NextApiHandler = {
  __sentry_route__?: string;
  (req: NextApiRequest, res: NextApiResponse): void | Promise<void> | unknown | Promise<unknown>;
};

export type WrappedNextApiHandler = {
  __sentry_route__?: string;
  __sentry_wrapped__?: boolean;
  (req: NextApiRequest, res: NextApiResponse): Promise<void> | Promise<unknown>;
};

export type AugmentedNextApiResponse = NextApiResponse & {
  __sentryTransaction?: Transaction;
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const withSentry = (origHandler: NextApiHandler): WrappedNextApiHandler => {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  return async (req, res) => {
    // first order of business: monkeypatch `res.end()` so that it will wait for us to send events to sentry before it
    // fires (if we don't do this, the lambda will close too early and events will be either delayed or lost)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    res.end = wrapEndMethod(res.end);

    // use a domain in order to prevent scope bleed between requests
    const local = domain.create();
    local.add(req);
    local.add(res);

    // `local.bind` causes everything to run inside a domain, just like `local.run` does, but it also lets the callback
    // return a value. In our case, all any of the codepaths return is a promise of `void`, but nextjs still counts on
    // getting that before it will finish the response.
    const boundHandler = local.bind(async () => {
      const currentScope = getCurrentHub().getScope();

      if (currentScope) {
        currentScope.setSDKProcessingMetadata({ request: req });

        if (hasTracingEnabled()) {
          // If there is a trace header set, extract the data from it (parentSpanId, traceId, and sampling decision)
          let traceparentData;
          if (req.headers && isString(req.headers['sentry-trace'])) {
            traceparentData = extractTraceparentData(req.headers['sentry-trace']);
            __DEBUG_BUILD__ && logger.log(`[Tracing] Continuing trace ${traceparentData?.traceId}.`);
          }

          const baggageHeader = req.headers && req.headers.baggage;
          const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(baggageHeader);

          // prefer the parameterized route, if we have it (which we will if we've auto-wrapped the route handler)
          let reqPath = origHandler.__sentry_route__ || this.__sentry_route__;

          // If not, fake it by just replacing parameter values with their names, hoping that none of them match either
          // each other or any hard-coded parts of the path
          if (!reqPath) {
            const url = `${req.url}`;
            // pull off query string, if any
            reqPath = stripUrlQueryAndFragment(url);
            // Replace with placeholder
            if (req.query) {
              for (const [key, value] of Object.entries(req.query)) {
                reqPath = reqPath.replace(`${value}`, `[${key}]`);
              }
            }
          }

          const reqMethod = `${(req.method || 'GET').toUpperCase()} `;

          const transaction = startTransaction(
            {
              name: `${reqMethod}${reqPath}`,
              op: 'http.server',
              ...traceparentData,
              metadata: {
                dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
                source: 'route',
                request: req,
              },
            },
            // extra context passed to the `tracesSampler`
            { request: req },
          );
          currentScope.setSpan(transaction);

          // save a link to the transaction on the response, so that even if there's an error (landing us outside of
          // the domain), we can still finish it (albeit possibly missing some scope data)
          (res as AugmentedNextApiResponse).__sentryTransaction = transaction;
        }
      }

      try {
        const handlerResult = await origHandler(req, res);

        if (process.env.NODE_ENV === 'development' && !process.env.SENTRY_IGNORE_API_RESOLUTION_ERROR) {
          // eslint-disable-next-line no-console
          console.warn(
            `[sentry] If Next.js logs a warning "API resolved without sending a response", it's a false positive, which we're working to rectify.
            In the meantime, to suppress this warning, set \`SENTRY_IGNORE_API_RESOLUTION_ERROR\` to 1 in your env.
            To suppress the nextjs warning, use the \`externalResolver\` API route option (see https://nextjs.org/docs/api-routes/api-middlewares#custom-config for details).`,
          );
        }

        return handlerResult;
      } catch (e) {
        // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
        // store a seen flag on it. (Because of the one-way-on-Vercel-one-way-off-of-Vercel approach we've been forced
        // to take, it can happen that the same thrown object gets caught in two different ways, and flagging it is a
        // way to prevent it from actually being reported twice.)
        const objectifiedErr = objectify(e);

        if (currentScope) {
          currentScope.addEventProcessor(event => {
            addExceptionMechanism(event, {
              type: 'instrument',
              handled: true,
              data: {
                wrapped_handler: origHandler.name,
                function: 'withSentry',
              },
            });
            return event;
          });

          captureException(objectifiedErr);
        }

        // Because we're going to finish and send the transaction before passing the error onto nextjs, it won't yet
        // have had a chance to set the status to 500, so unless we do it ourselves now, we'll incorrectly report that
        // the transaction was error-free
        res.statusCode = 500;
        res.statusMessage = 'Internal Server Error';

        // Make sure we have a chance to finish the transaction and flush events to Sentry before the handler errors
        // out. (Apps which are deployed on Vercel run their API routes in lambdas, and those lambdas will shut down the
        // moment they detect an error, so it's important to get this done before rethrowing the error. Apps not
        // deployed serverlessly will run into this cleanup function again in `res.end(), but it'll just no-op.)
        await finishSentryProcessing(res);

        // We rethrow here so that nextjs can do with the error whatever it would normally do. (Sometimes "whatever it
        // would normally do" is to allow the error to bubble up to the global handlers - another reason we need to mark
        // the error as already having been captured.)
        throw objectifiedErr;
      }
    });

    // Since API route handlers are all async, nextjs always awaits the return value (meaning it's fine for us to return
    // a promise here rather than a real result, and it saves us the overhead of an `await` call.)
    return boundHandler();
  };
};

type ResponseEndMethod = AugmentedNextApiResponse['end'];
type WrappedResponseEndMethod = AugmentedNextApiResponse['end'];

/**
 * Wrap `res.end()` so that it closes the transaction and flushes events before letting the request finish.
 *
 * Note: This wraps a sync method with an async method. While in general that's not a great idea in terms of keeping
 * things in the right order, in this case it's safe, because the native `.end()` actually *is* async, and its run
 * actually *is* awaited, just manually so (which reflects the fact that the core of the request/response code in Node
 * by far predates the introduction of `async`/`await`). When `.end()` is done, it emits the `prefinish` event, and
 * only once that fires does request processing continue. See
 * https://github.com/nodejs/node/commit/7c9b607048f13741173d397795bac37707405ba7.
 *
 * @param origEnd The original `res.end()` method
 * @returns The wrapped version
 */
function wrapEndMethod(origEnd: ResponseEndMethod): WrappedResponseEndMethod {
  return async function newEnd(this: AugmentedNextApiResponse, ...args: unknown[]) {
    await finishSentryProcessing(this);

    return origEnd.call(this, ...args);
  };
}

/**
 * Close the open transaction (if any) and flush events to Sentry.
 *
 * @param res The outgoing response for this request, on which the transaction is stored
 */
async function finishSentryProcessing(res: AugmentedNextApiResponse): Promise<void> {
  const { __sentryTransaction: transaction } = res;

  if (transaction) {
    transaction.setHttpStatus(res.statusCode);

    // Push `transaction.finish` to the next event loop so open spans have a better chance of finishing before the
    // transaction closes, and make sure to wait until that's done before flushing events
    const transactionFinished: Promise<void> = new Promise(resolve => {
      setImmediate(() => {
        transaction.finish();
        resolve();
      });
    });
    await transactionFinished;
  }

  // Flush the event queue to ensure that events get sent to Sentry before the response is finished and the lambda
  // ends. If there was an error, rethrow it so that the normal exception-handling mechanisms can apply.
  try {
    __DEBUG_BUILD__ && logger.log('Flushing events...');
    await flush(2000);
    __DEBUG_BUILD__ && logger.log('Done flushing events');
  } catch (e) {
    __DEBUG_BUILD__ && logger.log('Error while flushing events:\n', e);
  }
}
