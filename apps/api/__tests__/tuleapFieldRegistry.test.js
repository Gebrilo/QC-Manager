jest.mock('../src/services/tuleapClient', () => ({
  defaultClient: {
    get: jest.fn(),
  },
}));

const { defaultClient } = require('../src/services/tuleapClient');
const { FieldRegistry } = require('../src/services/tuleapFieldRegistry');

const MOCK_FIELDS = [
  { field_id: 42, name: 'summary', label: 'Summary', type: 'string', values: [] },
  { field_id: 43, name: 'status', label: 'Status', type: 'sb',
    values: [{ id: 100, label: 'Open' }, { id: 101, label: 'Closed' }] },
];

beforeEach(() => {
  jest.clearAllMocks();
  defaultClient.get.mockResolvedValue({ data: MOCK_FIELDS });
});

describe('FieldRegistry', () => {
  it('returns field_id for a known field', async () => {
    const reg = new FieldRegistry();
    const id = await reg.getFieldId(5, 'summary');
    expect(id).toBe(42);
  });

  it('resolves a bind value by label', async () => {
    const reg = new FieldRegistry();
    const val = await reg.resolveBindValue(5, 'status', 'Open');
    expect(val).toEqual({ id: 100 });
  });

  it('throws when field not found', async () => {
    const reg = new FieldRegistry();
    await expect(reg.getFieldId(5, 'nonexistent')).rejects.toThrow(/Field 'nonexistent' not found/);
  });

  it('throws when bind label not found', async () => {
    const reg = new FieldRegistry();
    await expect(reg.resolveBindValue(5, 'status', 'Unknown')).rejects.toThrow(/Bind value 'Unknown' not found/);
  });

  it('caches responses and only calls API once per tracker', async () => {
    const reg = new FieldRegistry();
    await reg.getFieldId(5, 'summary');
    await reg.getFieldId(5, 'summary');
    expect(defaultClient.get).toHaveBeenCalledTimes(1);
  });
});
