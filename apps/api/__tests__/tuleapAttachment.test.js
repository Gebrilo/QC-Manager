jest.mock('../src/services/tuleapClient', () => ({
  defaultClient: {
    _raw: { post: jest.fn(), patch: jest.fn() },
    patch: jest.fn(),
  },
}));

const { defaultClient } = require('../src/services/tuleapClient');
const { uploadFile, attachFilesToArtifact } = require('../src/services/tuleapAttachment');

describe('uploadFile', () => {
  it('returns the file id from Tuleap response', async () => {
    defaultClient._raw.post.mockResolvedValue({ data: { id: 99 } });
    const id = await uploadFile(Buffer.from('data'), 'image/png', 'shot.png');
    expect(id).toBe(99);
    expect(defaultClient._raw.post).toHaveBeenCalledWith(
      '/artifact_temporary_files',
      expect.anything(),
      expect.objectContaining({ headers: expect.objectContaining({ 'content-type': expect.stringContaining('multipart/form-data') }) })
    );
  });
});

describe('attachFilesToArtifact', () => {
  it('PATCHes the artifact with file field values', async () => {
    defaultClient.patch.mockResolvedValue({ data: {} });
    await attachFilesToArtifact(123, 55, [99, 100]);
    expect(defaultClient.patch).toHaveBeenCalledWith(
      '/artifacts/123',
      expect.objectContaining({ values: expect.arrayContaining([
        expect.objectContaining({ field_id: 55, value: [99, 100] })
      ]) })
    );
  });
});