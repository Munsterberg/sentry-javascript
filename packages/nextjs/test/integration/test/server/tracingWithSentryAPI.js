const assert = require('assert');

const { sleep } = require('../utils/common');
const { getAsync, interceptEventRequest, interceptTracingRequest } = require('../utils/server');

module.exports = async ({ url: urlBase, argv }) => {
  const urls = {
    unwrappedNoParamURL: `/api/withSentryAPI/unwrapped/noParams`,
    wrappedNoParamURL: `/api/withSentryAPI/wrapped/noParams`,
    unwrappedDynamicURL: `/api/withSentryAPI/unwrapped/dog`,
    wrappedDynamicURL: `/api/withSentryAPI/wrapped/dog`,
  };

  const interceptedRequests = {};

  Object.entries(urls).forEach(([testName, url]) => {
    interceptedRequests[testName] = interceptTracingRequest(
      {
        contexts: {
          trace: {
            op: 'http.server',
            status: 'ok',
            tags: { 'http.status_code': '200' },
          },
        },
        transaction: `GET ${url.replace('dog', '[animal]')}`,
        type: 'transaction',
        request: {
          url: `${urlBase}${url}`,
        },
      },
      argv,
      testName,
    );
  });

  Object.values(urls).forEach(async url => await getAsync(`${urlBase}${url}`));

  await sleep(500);

  Object.entries(interceptedRequests).forEach(([testName, request]) =>
    assert.ok(request.isDone(), `Did not intercept transaction request for ${testName}`),
  );
};
