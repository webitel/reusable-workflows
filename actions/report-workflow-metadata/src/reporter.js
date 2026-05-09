'use strict';

const TRANSIENT_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_RETRY_DELAY_MS = 1000;

function buildPayload({ sha, version, releaseLine }) {
  return {
    sha,
    version,
    release_line: releaseLine || version,
  };
}

async function reportWorkflowMetadata(options) {
  const warn = options.warn || defaultWarning;
  const fetchImpl = options.fetch || globalThis.fetch;
  const sleep = options.sleep || defaultSleep;
  const retries = Math.max(0, options.retries || 0);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);

  if (!fetchImpl) {
    warn('Workflow metadata reporting skipped: fetch is not available.');
    return false;
  }

  if (!options.sha || !options.version) {
    warn('Workflow metadata reporting skipped: sha and version inputs are required.');
    return false;
  }

  if (!options.requestToken || !options.requestUrl) {
    warn('Workflow metadata reporting skipped: OIDC request environment is missing. Check id-token: write permission.');
    return false;
  }

  let oidcToken;
  try {
    oidcToken = await requestOIDCToken({
      audience: options.audience,
      requestToken: options.requestToken,
      requestUrl: options.requestUrl,
      timeoutMs: options.timeoutMs,
      fetch: fetchImpl,
    });
  } catch (error) {
    warn(`Workflow metadata reporting skipped: ${error.message}`);
    return false;
  }

  const payload = JSON.stringify(buildPayload(options));
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await postMetadata({
      endpointUrl: options.endpointUrl,
      oidcToken,
      payload,
      timeoutMs: options.timeoutMs,
      fetch: fetchImpl,
    }).catch((error) => ({ error }));

    if (response.error) {
      if (attempt < retries) {
        await sleep(retryDelayMs);
        continue;
      }

      warn(`Workflow metadata callback failed: ${response.error.message}`);
      return false;
    }

    if (response.ok) {
      return true;
    }

    const responseBody = await safeText(response);
    const message = `Workflow metadata callback failed with HTTP ${response.status} ${response.statusText}: ${responseBody}`;
    if (attempt < retries && TRANSIENT_STATUS_CODES.has(response.status)) {
      await sleep(retryDelayMs);
      continue;
    }

    warn(message);
    return false;
  }

  warn('Workflow metadata callback failed.');
  return false;
}

async function requestOIDCToken({ audience, requestToken, requestUrl, timeoutMs, fetch }) {
  const tokenURL = new URL(requestUrl);
  tokenURL.searchParams.set('audience', audience);

  const response = await fetch(tokenURL, {
    headers: {
      Authorization: `Bearer ${requestToken}`,
    },
    signal: timeoutSignal(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`OIDC token request failed with HTTP ${response.status} ${response.statusText}: ${await safeText(response)}`);
  }

  const body = await response.json();
  if (!body || typeof body.value !== 'string' || body.value === '') {
    throw new Error('OIDC token response did not contain a token value.');
  }

  return body.value;
}

function postMetadata({ endpointUrl, oidcToken, payload, timeoutMs, fetch }) {
  return fetch(endpointUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${oidcToken}`,
      'Content-Type': 'application/json',
    },
    body: payload,
    signal: timeoutSignal(timeoutMs),
  });
}

async function safeText(response) {
  try {
    return (await response.text()).slice(0, 2000);
  } catch (error) {
    return `unable to read response body: ${error.message}`;
  }
}

function timeoutSignal(timeoutMs) {
  if (!timeoutMs || !AbortSignal.timeout) {
    return undefined;
  }

  return AbortSignal.timeout(timeoutMs);
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultWarning(message) {
  console.log(`::warning::${escapeCommandValue(message)}`);
}

function escapeCommandValue(value) {
  return String(value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

module.exports = {
  buildPayload,
  reportWorkflowMetadata,
  escapeCommandValue,
};
