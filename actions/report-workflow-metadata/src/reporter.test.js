'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPayload, reportWorkflowMetadata } = require('./reporter');

test('buildPayload sends only server contract fields', () => {
  assert.deepEqual(buildPayload({
    sha: 'abc123',
    version: '26.5',
    releaseLine: '26.5',
    repository: 'webitel/example',
    runId: '999',
  }), {
    sha: 'abc123',
    version: '26.5',
    release_line: '26.5',
  });
});

test('reportWorkflowMetadata requests OIDC token for the configured audience and posts metadata', async () => {
  const calls = [];
  const warnings = [];
  const fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return response(200, { value: 'oidc-token' });
    }

    return response(204, '');
  };

  const ok = await reportWorkflowMetadata({
    endpointUrl: 'https://dev.webitel.com/api/workflow-metadata',
    audience: 'https://dev.webitel.com',
    sha: 'abc123',
    version: '26.5',
    releaseLine: '26.5',
    requestToken: 'request-token',
    requestUrl: 'https://token.actions.githubusercontent.com?id=1',
    retries: 0,
    timeoutMs: 1000,
    fetch,
    warn: (message) => warnings.push(message),
    sleep: async () => {},
  });

  assert.equal(ok, true);
  assert.equal(warnings.length, 0);
  assert.equal(calls[0].url, 'https://token.actions.githubusercontent.com/?id=1&audience=https%3A%2F%2Fdev.webitel.com');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer request-token');
  assert.equal(calls[1].url, 'https://dev.webitel.com/api/workflow-metadata');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer oidc-token');
  assert.equal(calls[1].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    sha: 'abc123',
    version: '26.5',
    release_line: '26.5',
  });
});

test('reportWorkflowMetadata warns and returns false when OIDC request environment is missing', async () => {
  const warnings = [];

  const ok = await reportWorkflowMetadata({
    endpointUrl: 'https://dev.webitel.com/api/workflow-metadata',
    audience: 'https://dev.webitel.com',
    sha: 'abc123',
    version: '26.5',
    retries: 1,
    timeoutMs: 1000,
    fetch: async () => {
      throw new Error('fetch should not be called');
    },
    warn: (message) => warnings.push(message),
    sleep: async () => {},
  });

  assert.equal(ok, false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /OIDC request environment is missing/);
});

test('reportWorkflowMetadata warns and returns false when required metadata is missing', async () => {
  const warnings = [];

  const ok = await reportWorkflowMetadata({
    endpointUrl: 'https://dev.webitel.com/api/workflow-metadata',
    audience: 'https://dev.webitel.com',
    sha: '',
    version: '26.5',
    requestToken: 'request-token',
    requestUrl: 'https://token.actions.githubusercontent.com?id=1',
    retries: 1,
    timeoutMs: 1000,
    fetch: async () => {
      throw new Error('fetch should not be called');
    },
    warn: (message) => warnings.push(message),
    sleep: async () => {},
  });

  assert.equal(ok, false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /sha and version inputs are required/);
});

test('reportWorkflowMetadata retries transient callback failures', async () => {
  const calls = [];
  const warnings = [];
  const fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return response(200, { value: 'oidc-token' });
    }
    if (calls.length === 2) {
      return response(500, 'temporary outage');
    }

    return response(204, '');
  };

  const ok = await reportWorkflowMetadata({
    endpointUrl: 'https://dev.webitel.com/api/workflow-metadata',
    audience: 'https://dev.webitel.com',
    sha: 'abc123',
    version: '26.5',
    requestToken: 'request-token',
    requestUrl: 'https://token.actions.githubusercontent.com?id=1',
    retries: 1,
    timeoutMs: 1000,
    fetch,
    warn: (message) => warnings.push(message),
    sleep: async () => {},
  });

  assert.equal(ok, true);
  assert.equal(warnings.length, 0);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].url, 'https://dev.webitel.com/api/workflow-metadata');
  assert.equal(calls[2].url, 'https://dev.webitel.com/api/workflow-metadata');
});

test('reportWorkflowMetadata does not retry non-transient callback failures', async () => {
  const calls = [];
  const warnings = [];
  const fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return response(200, { value: 'oidc-token' });
    }

    return response(422, 'repository not in catalog');
  };

  const ok = await reportWorkflowMetadata({
    endpointUrl: 'https://dev.webitel.com/api/workflow-metadata',
    audience: 'https://dev.webitel.com',
    sha: 'abc123',
    version: '26.5',
    requestToken: 'request-token',
    requestUrl: 'https://token.actions.githubusercontent.com?id=1',
    retries: 3,
    timeoutMs: 1000,
    fetch,
    warn: (message) => warnings.push(message),
    sleep: async () => {},
  });

  assert.equal(ok, false);
  assert.equal(calls.length, 2);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /422/);
  assert.match(warnings[0], /repository not in catalog/);
});

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 204 ? 'No Content' : 'Status',
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body);
    },
    async json() {
      return body;
    },
  };
}
