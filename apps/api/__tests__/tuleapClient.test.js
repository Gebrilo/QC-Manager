const axios = require('axios');
jest.mock('axios');

const { createTuleapClient } = require('../src/services/tuleapClient');

describe('createTuleapClient', () => {
  let mockInstance;

  beforeEach(() => {
    mockInstance = {
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
      get: jest.fn(),
      post: jest.fn(),
    };
    axios.create.mockReturnValue(mockInstance);
  });

  it('creates axios instance with correct baseURL', () => {
    createTuleapClient({ baseURL: 'https://example.com', accessKey: 'tok' });
    expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: 'https://example.com/api/v1',
    }));
  });

  it('registers request + response interceptors', () => {
    createTuleapClient({ baseURL: 'https://example.com', accessKey: 'tok' });
    expect(mockInstance.interceptors.request.use).toHaveBeenCalledTimes(1);
    expect(mockInstance.interceptors.response.use).toHaveBeenCalledTimes(1);
  });

  it('exposes get, post, put, patch, delete, _raw', () => {
    const client = createTuleapClient({ baseURL: 'https://example.com', accessKey: 'tok' });
    expect(typeof client.get).toBe('function');
    expect(typeof client.post).toBe('function');
    expect(typeof client.put).toBe('function');
    expect(typeof client.patch).toBe('function');
    expect(typeof client.delete).toBe('function');
    expect(client._raw).toBe(mockInstance);
  });

  it('calls through to the underlying instance', async () => {
    mockInstance.get.mockResolvedValue({ data: { id: 1 } });
    const client = createTuleapClient({ baseURL: 'https://example.com', accessKey: 'tok' });
    const result = await client.get('/artifacts/1');
    expect(result).toEqual({ data: { id: 1 } });
  });
});

describe('error normalisation interceptor', () => {
  it('normalises axios 404 error into { status, message, raw }', async () => {
    let errorHandler;
    const mockInst = {
      interceptors: {
        request: { use: jest.fn() },
        response: {
          use: jest.fn((ok, err) => { errorHandler = err; }),
        },
      },
      get: jest.fn(),
    };
    axios.create.mockReturnValue(mockInst);
    createTuleapClient({ baseURL: 'https://example.com', accessKey: 'tok' });

    const axiosError = {
      isAxiosError: true,
      response: {
        status: 404,
        data: { error: { message: 'Artifact not found', code: 404 } },
      },
    };

    await expect(errorHandler(axiosError)).rejects.toMatchObject({
      status: 404,
      message: 'Artifact not found',
    });
  });
});
