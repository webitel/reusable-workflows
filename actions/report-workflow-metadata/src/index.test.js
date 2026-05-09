'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { input, integerInput } = require('./index');

function withEnv(vars, fn) {
  const previous = {};
  for (const [k, v] of Object.entries(vars)) {
    previous[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

test('input reads dashed names from INPUT_<NAME-WITH-DASH> as GitHub Actions sets them', () => {
  // GitHub Actions converts spaces to underscores but keeps dashes as-is when
  // exposing `with:` inputs as env vars. `release-line: 26.3` becomes
  // `INPUT_RELEASE-LINE=26.3`, NOT `INPUT_RELEASE_LINE`.
  withEnv({ 'INPUT_RELEASE-LINE': '26.3', INPUT_RELEASE_LINE: undefined }, () => {
    assert.equal(input('release-line'), '26.3');
  });
});

test('input falls back to default when env var is missing or empty', () => {
  withEnv({ 'INPUT_ENDPOINT-URL': undefined }, () => {
    assert.equal(input('endpoint-url', 'https://example/default'), 'https://example/default');
  });
  withEnv({ 'INPUT_ENDPOINT-URL': '' }, () => {
    assert.equal(input('endpoint-url', 'https://example/default'), 'https://example/default');
  });
});

test('input handles plain (no-dash) names', () => {
  withEnv({ INPUT_VERSION: '26.3-27' }, () => {
    assert.equal(input('version'), '26.3-27');
  });
});

test('integerInput parses valid numbers and falls back on invalid', () => {
  withEnv({ INPUT_RETRIES: '5' }, () => {
    assert.equal(integerInput('retries', 2), 5);
  });
  withEnv({ INPUT_RETRIES: 'not-a-number' }, () => {
    assert.equal(integerInput('retries', 2), 2);
  });
  withEnv({ INPUT_RETRIES: '-1' }, () => {
    assert.equal(integerInput('retries', 2), 2);
  });
});
