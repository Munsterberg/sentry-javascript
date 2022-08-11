import { GSProps } from './types';
import { callOriginal } from './wrapperUtils';

/**
 * Create a wrapped version of the user's exported `getStaticProps` function
 *
 * @param origGetStaticProps: The user's `getStaticProps` function
 * @returns A wrapped version of the function
 */
export function withSentryGetStaticProps(origGetStaticProps: GSProps['fn']): GSProps['wrappedFn'] {
  return async function (context: GSProps['context']): Promise<GSProps['result']> {
    return callOriginal<GSProps>(origGetStaticProps, context);
  };
}