import * as path from 'path';

import { isESM } from '../../utils/isESM';
import { getExportIdentifiers, hasDefaultExport, makeAST } from './ast';
import { LoaderThis } from './types';

type LoaderOptions = {
  projectDir: string;
};

/**
 * Wrap `getStaticPaths`, `getStaticProps`, and `getServerSideProps` (if they exist) in the given page code
 */
export default function wrapDataFetchersLoader(this: LoaderThis<LoaderOptions>, userCode: string): string {
  if (!isESM(userCode) || this.resourceQuery === '?sentry-proxy-loader') {
    return userCode;
  }

  // We know one or the other will be defined, depending on the version of webpack being used
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const { projectDir } = 'getOptions' in this ? this.getOptions() : this.query;

  // We obtain the parameterizedRoute from the folder structure of the nextjs project
  const parameterizedRoute = path
    .relative(path.resolve(projectDir, 'pages'), this.resourcePath)
    .replace(/\.[^/.]+$/, '') // remove file extension from path
    .replace(/index$/, ''); // in case the page is an index file we remove index from the parameterized rout

  const ast = makeAST(userCode, true);

  let hasDataFetchingFunction = false;
  let hasGetServerSideProps = false;
  let hasGetStaticProps = false;
  let hasGetStaticPaths = false;

  const exportedIdentifiers = getExportIdentifiers(ast).filter(exportIdentifier => {
    if (exportIdentifier === 'getServerSideProps') {
      hasGetServerSideProps = true;
      hasDataFetchingFunction = true;
      return false;
    } else if (exportIdentifier === 'getStaticProps') {
      hasGetStaticProps = true;
      hasDataFetchingFunction = true;
      return false;
    } else if (exportIdentifier === 'getStaticPaths') {
      hasGetStaticPaths = true;
      hasDataFetchingFunction = true;
      return false;
    } else {
      return true;
    }
  });

  let outputFileContent = '';

  if (hasDataFetchingFunction) {
    outputFileContent = `
      import * as sentryNextJsServerSDK from "@sentry/nextjs/build/esm/index.server";
      import * as sentryNextJsClientSDK from "@sentry/nextjs/build/esm/index.client";`;
  }

  if (exportedIdentifiers.length > 0) {
    outputFileContent += `export { ${exportedIdentifiers.join(', ')} } from "${
      this.resourcePath
    }?sentry-proxy-loader";`;
  }

  if (hasDefaultExport(ast)) {
    outputFileContent += `
      import { default as _sentry_default } from "${this.resourcePath}?sentry-proxy-loader";
      Object.defineProperty(
        _sentry_default,
        'getInitialProps',
        {
          value: sentryNextJsClientSDK.withSentryGetInitialProps(_sentry_default.getInitialProps, _sentry_default, "/${parameterizedRoute}"),
          enumerable: true,
          configurable: true,
          writable: true
        }
      );
      export { _sentry_default as default };`;
  }

  if (hasGetServerSideProps) {
    outputFileContent += `
      import { getServerSideProps as _sentry_getServerSideProps } from "${this.resourcePath}?sentry-proxy-loader";
      export const getServerSideProps = sentryNextJsServerSDK.withSentryGetServerSideProps(_sentry_getServerSideProps, "/${parameterizedRoute}");`;
  }

  if (hasGetStaticProps) {
    outputFileContent += `
      import { getStaticProps as _sentry_getStaticProps } from "${this.resourcePath}?sentry-proxy-loader";
      export const getStaticProps = sentryNextJsServerSDK.withSentryGetStaticProps(_sentry_getStaticProps, "/${parameterizedRoute}");`;
  }

  if (hasGetStaticPaths) {
    outputFileContent += `
      import { getStaticPaths as _sentry_getStaticPaths } from "${this.resourcePath}?sentry-proxy-loader";
      export const getStaticPaths = sentryNextJsServerSDK.withSentryGetStaticPaths(_sentry_getStaticPaths, "/${parameterizedRoute}");`;
  }

  return outputFileContent;
}
