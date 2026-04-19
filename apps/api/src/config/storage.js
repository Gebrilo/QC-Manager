'use strict';

const { createClient } = require('@supabase/supabase-js');

let supabaseAdmin = null;

const IDP_ATTACHMENTS_BUCKET = 'idp-attachments';

function getStorageClient() {
    if (supabaseAdmin) return supabaseAdmin;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for file storage');
    }

    supabaseAdmin = createClient(supabaseUrl, supabaseKey);
    return supabaseAdmin;
}

async function ensureBucketExists() {
    const client = getStorageClient();
    const { data: buckets } = await client.storage.listBuckets();
    const exists = buckets.some(b => b.name === IDP_ATTACHMENTS_BUCKET);
    if (!exists) {
        await client.storage.createBucket(IDP_ATTACHMENTS_BUCKET, {
            public: false,
            fileSizeLimit: '20MB',
            allowedMimeTypes: [
                'application/pdf',
                'image/png', 'image/jpeg', 'image/gif', 'image/webp',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'text/plain', 'text/csv',
                'application/zip',
            ],
        });
    }
}

async function uploadFile(storagePath, buffer, mimeType) {
    const client = getStorageClient();
    const { data, error } = await client.storage
        .from(IDP_ATTACHMENTS_BUCKET)
        .upload(storagePath, buffer, {
            contentType: mimeType,
            upsert: false,
        });
    if (error) throw error;
    return data;
}

async function downloadFile(storagePath) {
    const client = getStorageClient();
    const { data, error } = await client.storage
        .from(IDP_ATTACHMENTS_BUCKET)
        .download(storagePath);
    if (error) throw error;
    return data;
}

async function deleteFile(storagePath) {
    const client = getStorageClient();
    const { error } = await client.storage
        .from(IDP_ATTACHMENTS_BUCKET)
        .remove([storagePath]);
    if (error) throw error;
}

async function createSignedUrl(storagePath, expiresIn = 3600) {
    const client = getStorageClient();
    const { data, error } = await client.storage
        .from(IDP_ATTACHMENTS_BUCKET)
        .createSignedUrl(storagePath, expiresIn);
    if (error) throw error;
    return data.signedUrl;
}

module.exports = {
    getStorageClient,
    ensureBucketExists,
    uploadFile,
    downloadFile,
    deleteFile,
    createSignedUrl,
    IDP_ATTACHMENTS_BUCKET,
};
