import { GSSP } from './types';
import { callOriginal } from './wrapperUtils';

/**
 * Create a wrapped version of the user's exported `getServerSideProps` function
 *
 * @param origGetServerSideProps: The user's `getServerSideProps` function
 * @returns A wrapped version of the function
 */
export function withSentryGetServerSideProps(origGetServerSideProps: GSSP['fn'], path: string): GSSP['wrappedFn'] {
  return async function (context: GSSP['context']): Promise<GSSP['result']> {
    console.log(`Called withSentryGetServerSideProps at "${path}"`);
    return callOriginal<GSSP>(origGetServerSideProps, context);
  };
}
