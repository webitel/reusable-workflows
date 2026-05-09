'use strict';

const { escapeCommandValue, reportWorkflowMetadata } = require('./reporter');

run().catch((error) => {
  warning(`Workflow metadata reporting skipped: ${error.message}`);
});

async function run() {
  const reported = await reportWorkflowMetadata({
    endpointUrl: input('endpoint-url', 'https://dev.webitel.com/api/workflow-metadata'),
    audience: input('audience', 'https://dev.webitel.com'),
    sha: input('sha'),
    version: input('version'),
    releaseLine: input('release-line'),
    retries: integerInput('retries', 2),
    timeoutMs: integerInput('timeout-ms', 5000),
    retryDelayMs: integerInput('retry-delay-ms', 1000),
    requestToken: process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
    requestUrl: process.env.ACTIONS_ID_TOKEN_REQUEST_URL,
  });

  if (reported) {
    console.log('Workflow metadata reported.');
  }
}

function input(name, defaultValue = '') {
  const value = process.env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`];
  return value === undefined || value === '' ? defaultValue : value;
}

function integerInput(name, defaultValue) {
  const value = Number.parseInt(input(name, String(defaultValue)), 10);
  if (!Number.isFinite(value) || value < 0) {
    warning(`Invalid ${name} input; using ${defaultValue}.`);
    return defaultValue;
  }

  return value;
}

function warning(message) {
  console.log(`::warning::${escapeCommandValue(message)}`);
}
