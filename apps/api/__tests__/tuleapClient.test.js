const axios = require('axios');
jest.mock('axios');

const { createTuleapClient, deps } = require('../src/services/tuleapClient');

function setupMock() {
  const interceptors = {
    request: { handlers: [], use(fn) { this.handlers.push(fn); } },
    response: { successHandlers: [], errorHandlers: [], use(onSuccess, onError) { this.successHandlers.push(onSuccess); this.errorHandlers.push(onError); } },
  };
  const mockInstance = {
    interceptors,
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  };
  axios.create.mockReturnValue(mockInstance);
  return { interceptors, mockInstance };
}

describe('createTuleapClient', () => {
  let interceptors, mockInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ interceptors, mockInstance } = setupMock());
  });

  it('injects X-Auth-AccessKey on every request', () => {
    createTuleapClient({ baseURL: 'https://example.com', accessKey: 'tok' });

    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://example.com/api/v1' })
    );
    expect(interceptors.request.handlers.length).toBe(1);

    const requestInterceptor = interceptors.request.handlers[0];
    const config = { headers: {} };
    const result = requestInterceptor(config);
    expect(result.headers['X-Auth-AccessKey']).toBe('tok');
  });

  it('throws a normalised error on 404', async () => {
    mockInstance.get.mockRejectedValue({ message: 'Not found', status: 404 });

    const client = createTuleapClient({ baseURL: 'https://example.com', accessKey: 'tok' });
    await expect(client.get('/foo')).rejects.toMatchObject({
      status: 404,
      message: 'Not found',
    });
  });

  it('normalises error via response interceptor with code and raw fields', () => {
    createTuleapClient({ baseURL: 'https://example.com', accessKey: 'tok' });
    const errorInterceptor = interceptors.response.errorHandlers[0];
    const axiosError = {
      isAxiosError: true,
      response: {
        status: 500,
        data: { error: { code: 'ERR_INTERNAL', message: 'Internal error' }, extra: 'data' },
      },
    };

    return expect(errorInterceptor(axiosError)).rejects.toMatchObject({
      status: 500,
      code: 'ERR_INTERNAL',
      message: 'Internal error',
      raw: { error: { code: 'ERR_INTERNAL', message: 'Internal error' }, extra: 'data' },
    });
  });

  it('uses data.message as fallback when data.error.message is absent', () => {
    createTuleapClient({ baseURL: 'https://example.com', accessKey: 'tok' });
    const errorInterceptor = interceptors.response.errorHandlers[0];
    const axiosError = {
      isAxiosError: true,
      response: { status: 400, data: { message: 'Bad Request fallback' } },
    };

    return expect(errorInterceptor(axiosError)).rejects.toMatchObject({
      status: 400,
      message: 'Bad Request fallback',
    });
  });

  it('uses HTTP status as message when no message in data', () => {
    createTuleapClient({ baseURL: 'https://example.com', accessKey: 'tok' });
    const errorInterceptor = interceptors.response.errorHandlers[0];
    const axiosError = {
      isAxiosError: true,
      response: { status: 502, data: {} },
    };

    return expect(errorInterceptor(axiosError)).rejects.toMatchObject({
      status: 502,
      message: 'HTTP 502',
    });
  });

  it('retries on 429 up to 3 times with exponential backoff', async () => {
    const sleepSpy = jest.spyOn(deps, 'sleep').mockImplementation(() => Promise.resolve());

    mockInstance.get
      .mockRejectedValueOnce({ message: 'Rate limited', status: 429 })
      .mockRejectedValueOnce({ message: 'Rate limited', status: 429 })
      .mockResolvedValueOnce({ data: { id: 1 } });

    const client = createTuleapClient({ baseURL: 'https://example.com', accessKey: 'tok' });
    const result = await client.get('/retry');
    expect(result.data).toEqual({ id: 1 });
    expect(mockInstance.get).toHaveBeenCalledTimes(3);
    expect(sleepSpy).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenNthCalledWith(1, 1000);
    expect(sleepSpy).toHaveBeenNthCalledWith(2, 2000);

    sleepSpy.mockRestore();
  });

  it('retries on 5xx errors', async () => {
    const sleepSpy = jest.spyOn(deps, 'sleep').mockImplementation(() => Promise.resolve());

    mockInstance.get
      .mockRejectedValueOnce({ message: 'Bad Gateway', status: 502 })
      .mockResolvedValueOnce({ data: { ok: true } });

    const client = createTuleapClient({ baseURL: 'https://example.com', accessKey: 'tok' });
    const result = await client.get('/retry-5xx');
    expect(result.data).toEqual({ ok: true });
    expect(mockInstance.get).toHaveBeenCalledTimes(2);

    sleepSpy.mockRestore();
  });

  it('does not retry on 4xx errors other than 429', async () => {
    mockInstance.get.mockRejectedValue({ message: 'Forbidden', status: 403 });

    const client = createTuleapClient({ baseURL: 'https://example.com', accessKey: 'tok' });
    await expect(client.get('/forbidden')).rejects.toMatchObject({ status: 403 });
    expect(mockInstance.get).toHaveBeenCalledTimes(1);
  });

  it('gives up after MAX_RETRIES retries (4 total attempts)', async () => {
    const sleepSpy = jest.spyOn(deps, 'sleep').mockImplementation(() => Promise.resolve());

    mockInstance.get.mockRejectedValue({ message: 'Server Error', status: 500 });

    const client = createTuleapClient({ baseURL: 'https://example.com', accessKey: 'tok' });
    await expect(client.get('/exhausted')).rejects.toMatchObject({ status: 500 });
    expect(mockInstance.get).toHaveBeenCalledTimes(4);
    expect(sleepSpy).toHaveBeenCalledTimes(3);
    expect(sleepSpy).toHaveBeenNthCalledWith(1, 1000);
    expect(sleepSpy).toHaveBeenNthCalledWith(2, 2000);
    expect(sleepSpy).toHaveBeenNthCalledWith(3, 4000);

    sleepSpy.mockRestore();
  });

  it('exposes _raw axios instance for multipart uploads', () => {
    const client = createTuleapClient({ baseURL: 'https://example.com', accessKey: 'tok' });
    expect(client._raw).toBe(mockInstance);
  });

  it('falls back to env vars when options not provided', () => {
    process.env.TULEAP_BASE_URL = 'https://env.example.com';
    process.env.TULEAP_ACCESS_KEY = 'env-key';

    const { interceptors: envInterceptors } = setupMock();
    createTuleapClient();
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://env.example.com/api/v1' })
    );

    const requestInterceptor = envInterceptors.request.handlers[0];
    const config = { headers: {} };
    const result = requestInterceptor(config);
    expect(result.headers['X-Auth-AccessKey']).toBe('env-key');

    delete process.env.TULEAP_BASE_URL;
    delete process.env.TULEAP_ACCESS_KEY;
  });

  it('defaultClient lazy getter creates singleton', () => {
    jest.clearAllMocks();
    const { defaultClient } = require('../src/services/tuleapClient');
    expect(defaultClient).toBeDefined();
    expect(typeof defaultClient.get).toBe('function');
    expect(typeof defaultClient.post).toBe('function');
  });

it('normalises non-Axios errors via interceptor into standard shape', () => {
    createTuleapClient({ baseURL: 'https://example.com', accessKey: 'tok' });
    const errorInterceptor = interceptors.response.errorHandlers[0];
    const plainError = Object.assign(new Error('Network timeout'), { code: 'ECONNRESET' });

    return expect(errorInterceptor(plainError)).rejects.toMatchObject({
      message: 'Network timeout',
      status: null,
      code: 'ECONNRESET',
    });
  });
});