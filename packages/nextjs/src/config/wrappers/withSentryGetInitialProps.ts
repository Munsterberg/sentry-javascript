/**
 * Create a wrapped version of the user's exported `getInitialProps` function
 *
 * @param origGetInitialProps: The user's `getInitialProps` function
 * @returns A wrapped version of the function
 */
export function withSentryGetInitialProps(origGetInitialProps: any, defaultImport: any, path: string): any {
  if (typeof defaultImport.getInitialProps === 'function') {
    return async function (...args: unknown[]) {
      console.log(`Called withSentryGetInitialProps at "${path}"`);
      return await origGetInitialProps.call(defaultImport, ...args);
    };
  } else {
    return defaultImport.getInitialProps;
  }
}
