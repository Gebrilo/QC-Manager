const axios = require('axios');

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const deps = {
  sleep: (ms) => new Promise(r => setTimeout(r, ms)),
};

function normaliseError(err) {
  if (err.isAxiosError && err.response) {
    const { status, data } = err.response;
    const message = data?.error?.message || data?.message || `HTTP ${status}`;
    const normalized = new Error(message);
    normalized.status = status;
    normalized.code = data?.error?.code || null;
    normalized.raw = data;
    return normalized;
  }
  return err;
}

function createTuleapClient({ baseURL, accessKey } = {}) {
  const url = baseURL || process.env.TULEAP_BASE_URL;
  const key = accessKey || process.env.TULEAP_ACCESS_KEY;

  const instance = axios.create({
    baseURL: `${url}/api/v1`,
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  instance.interceptors.request.use(cfg => {
    cfg.headers['X-Auth-AccessKey'] = key;
    return cfg;
  });

  instance.interceptors.response.use(
    r => r,
    err => Promise.reject(normaliseError(err))
  );

  const withRetry = (method) => async (...args) => {
    let attempt = 0;
    while (true) {
      try {
        return await instance[method](...args);
      } catch (err) {
        attempt++;
        if (attempt >= MAX_RETRIES || !RETRY_STATUSES.has(err.status)) throw err;
        await deps.sleep(RETRY_DELAY_MS * Math.pow(2, attempt - 1));
      }
    }
  };

  return {
    get: withRetry('get'),
    post: withRetry('post'),
    put: withRetry('put'),
    patch: withRetry('patch'),
    delete: withRetry('delete'),
    _raw: instance,
  };
}

let _defaultClient;

module.exports = { createTuleapClient, deps };
Object.defineProperty(module.exports, 'defaultClient', {
  get() {
    if (!_defaultClient) _defaultClient = createTuleapClient();
    return _defaultClient;
  },
});