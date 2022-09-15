// import { Routes } from '@angular/router';
import * as Sentry from '../src';
import { Hub } from '@sentry/types';
import { setupTestEnv, HomeComponent, AppComponent, navigateInAngular } from './utils';

let transaction: any;

jest.mock('@sentry/browser', () => {
  const original = jest.requireActual('@sentry/browser');
  return {
    ...original,
    getCurrentHub: () => {
      return {
        getScope: () => {
          return {
            getTransaction: () => {
              return transaction;
            },
          };
        },
      } as unknown as Hub;
    },
  };
});

describe.only('Angular Tracing', () => {
  // const startTransaction = jest.fn();

  describe('instrumentAngularRouting', () => {
    // it('attaches the transaction source on the pageload transaction', () => {
    //   Sentry.instrumentAngularRouting(startTransaction);
    //   expect(startTransaction).toHaveBeenCalledWith({
    //     name: '/',
    //     op: 'pageload',
    //     metadata: { source: 'url' },
    //   });
    // });
  });

  describe('TraceService', () => {
    // const routes: Routes = [
    //   { path: '', redirectTo: 'home', pathMatch: 'full' },
    //   { path: 'home', component: HomeComponent },
    // ];

    it('attaches the transaction source on a navigation change', async () => {
      // Sentry.instrumentAngularRouting(startTransaction);
      // const { router, fixture } = await setupTestEnv(routes, [AppComponent, HomeComponent]);
      // await navigateInAngular(router, '/home', fixture);
      // expect(startTransaction).toHaveBeenCalledWith({
      //   name: '/home',
      //   op: 'navigation',
      //   metadata: { source: 'url' },
      // });
    });
  });

  describe('URL parameterization', () => {
    it.each([
      [
        'handles the root URL correctly',
        '/',
        {
          root: { firstChild: { routeConfig: null } },
        },
        '/',
        [
          {
            path: '',
            component: HomeComponent,
          },
        ],
      ],
      [
        'does not alter static routes',
        '/books',
        {
          root: { firstChild: { routeConfig: { path: 'books' } } },
        },
        '/books/',
        [
          {
            path: 'books',
            component: HomeComponent,
          },
        ],
      ],
      [
        'parameterizes IDs in the URL',
        '/books/1/details',
        {
          root: { firstChild: { routeConfig: { path: 'books/:bookId/details' } } },
        },
        '/books/:bookId/details/',
        [
          {
            path: 'books/:bookId/details',
            component: HomeComponent,
          },
        ],
      ],
      [
        'parameterizes multiple IDs in the URL',
        '/org/sentry/projects/1234/events/04bc6846-4a1e-4af5-984a-003258f33e31',
        {
          root: { firstChild: { routeConfig: { path: 'org/:orgId/projects/:projId/events/:eventId' } } },
        },
        '/org/:orgId/projects/:projId/events/:eventId/',
        [
          {
            path: 'org/:orgId/projects/:projId/events/:eventId',
            component: HomeComponent,
          },
        ],
      ],
      [
        'parameterizes URLs from route with child routes',
        '/org/sentry/projects/1234/events/04bc6846-4a1e-4af5-984a-003258f33e31',
        {
          root: {
            firstChild: {
              routeConfig: { path: 'org/:orgId' },
              firstChild: {
                routeConfig: { path: 'projects/:projId' },
                firstChild: { routeConfig: { path: 'events/:eventId' } },
              },
            },
          },
        },
        '/org/:orgId/projects/:projId/events/:eventId/',
        [
          {
            path: 'org/:orgId',
            component: HomeComponent,
            children: [
              {
                path: 'projects/:projId',
                component: HomeComponent,
                children: [
                  {
                    path: 'events/:eventId',
                    component: HomeComponent,
                  },
                ],
              },
            ],
          },
        ],
      ],
    ])('%s and sets the source to `route`', async (_, url, routerState, result, routes) => {
      jest.spyOn(Sentry, 'startTransaction').mockImplementation(ctx => {
        console.log('ctx', ctx);
        transaction = {
          ...ctx,
          setName: jest.fn(name => (transaction.name = name)),
        };

        return transaction;
      });

      Sentry.instrumentAngularRouting(Sentry.startTransaction, false, true);
      const { router, fixture } = await setupTestEnv(routes, [AppComponent, HomeComponent]);

      await navigateInAngular(router, url, fixture, routerState);

      expect(Sentry.startTransaction).toHaveBeenCalledWith({
        name: url,
        op: 'navigation',
        metadata: { source: 'url' },
      });

      expect(Sentry.startTransaction).toHaveBeenCalledWith({
        name: result,
        op: 'navigation',
        metadata: { source: 'url' },
      });
    });
  });
});
