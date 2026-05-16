const FormData = require('form-data');
const { defaultClient } = require('./tuleapClient');

async function uploadFile(bufferOrPath, mimeType, fileName, client = defaultClient) {
  const form = new FormData();
  const buf = Buffer.isBuffer(bufferOrPath)
    ? bufferOrPath
    : require('fs').readFileSync(bufferOrPath);

  form.append('file_creator[filename]', fileName);
  form.append('file_creator[mimetype]', mimeType);
  form.append('file_creator[content]', buf.toString('base64'));

  const { data } = await client._raw.post('/artifact_temporary_files', form, {
    headers: form.getHeaders(),
  });
  return data.id;
}

async function attachFilesToArtifact(artifactId, fileFieldId, fileIds, client = defaultClient) {
  await client.patch(`/artifacts/${artifactId}`, {
    values: [{ field_id: fileFieldId, value: fileIds }],
  });
}

module.exports = { uploadFile, attachFilesToArtifact };