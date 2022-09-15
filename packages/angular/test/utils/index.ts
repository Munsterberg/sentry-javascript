import { Component, NgModule } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { Router, Routes } from '@angular/router';
import { TraceService } from '../../src';

@Component({
  template: `Home`,
})
export class HomeComponent {}

@Component({
  template: `<router-outlet></router-outlet>`,
})
export class AppComponent {}

@NgModule({
  providers: [
    {
      provide: TraceService,
      deps: [Router],
    },
  ],
})
export class AppModule {}

export const setupTestEnv = async (routes: Routes, components: any[]) => {
  jest.resetAllMocks();
  TestBed.resetTestEnvironment();

  TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
  TestBed.configureTestingModule({
    imports: [AppModule, RouterTestingModule.withRoutes(routes)],
    declarations: components,
    providers: [
      {
        provide: TraceService,
        deps: [Router],
      },
    ],
  });

  // await TestBed.compileComponents();

  // init({
  //   dsn: 'https://public@dsn.ingest.sentry.io/1337',
  //   tracesSampleRate: 1,
  // });

  const router = TestBed.get(Router) as Router;
  const traceService = new TraceService(router);

  const fixture = TestBed.createComponent(AppComponent);

  return { router, fixture, traceService };
};

export const navigateInAngular = (
  router: Router,
  url: string,
  fixture: ComponentFixture<AppComponent>,
  routerState?: {
    [k: string]: any;
  },
) => {
  // console.warn(fixture.isStable());
  return fixture.ngZone?.run(() => {
    return router.navigateByUrl(url, { state: routerState });
  });
};
