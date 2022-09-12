import * as SentryCore from '@sentry/core';
import * as SentryTracing from '@sentry/tracing';
import { IncomingMessage, ServerResponse } from 'http';

import {
  withSentryGetServerSideProps,
  withSentryServerSideGetInitialProps,
  // TODO: Leaving `withSentryGetStaticProps` out for now until we figure out what to do with it
  // withSentryGetStaticProps,
  // TODO: Leaving these out for now until we figure out pages with no data fetchers
  // withSentryServerSideAppGetInitialProps,
  // withSentryServerSideDocumentGetInitialProps,
  // withSentryServerSideErrorGetInitialProps,
} from '../../src/config/wrappers';

const startTransactionSpy = jest.spyOn(SentryCore, 'startTransaction');
const setMetadataSpy = jest.spyOn(SentryTracing.Transaction.prototype, 'setMetadata');

describe('data-fetching function wrappers', () => {
  const route = '/tricks/[trickName]';
  let req: IncomingMessage;
  let res: ServerResponse;

  describe('starts a transaction if tracing enabled', () => {
    beforeEach(() => {
      req = { headers: {}, url: 'http://dogs.are.great/tricks/kangaroo' } as IncomingMessage;
      res = {} as ServerResponse;

      jest.spyOn(SentryTracing, 'hasTracingEnabled').mockReturnValueOnce(true);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    test('withSentryGetServerSideProps', async () => {
      const origFunction = jest.fn(async () => ({ props: {} }));

      const wrappedOriginal = withSentryGetServerSideProps(origFunction, route);
      await wrappedOriginal({ req, res } as any);

      expect(startTransactionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '/tricks/[trickName]',
          op: 'nextjs.data.server',
          metadata: expect.objectContaining({ source: 'route' }),
        }),
      );

      expect(setMetadataSpy).toHaveBeenCalledWith({ request: req });
    });

    test('withSentryServerSideGetInitialProps', async () => {
      const origFunction = jest.fn(async () => ({}));

      const wrappedOriginal = withSentryServerSideGetInitialProps(origFunction);
      await wrappedOriginal({ req, res, pathname: route } as any);

      expect(startTransactionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '/tricks/[trickName]',
          op: 'nextjs.data.server',
          metadata: expect.objectContaining({ source: 'route' }),
        }),
      );

      expect(setMetadataSpy).toHaveBeenCalledWith({ request: req });
    });
  });
});
