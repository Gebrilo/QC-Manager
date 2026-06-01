const axios = require('axios');

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

const triggerWorkflow = async (triggerName, payload, options = {}) => {
    const { strict = false } = options;

    if (!N8N_WEBHOOK_URL) {
        if (strict) {
            throw new Error('N8N_WEBHOOK_URL is not configured');
        }
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[Mock n8n] Triggered '${triggerName}'`, payload);
        }
        return;
    }

    const url = `${N8N_WEBHOOK_URL}/${triggerName}`;

    if (strict) {
        try {
            await axios.post(url, payload);
            return;
        } catch (err) {
            const message = err?.response?.data?.message || err?.message || 'Unknown n8n trigger error';
            throw new Error(`Failed to trigger n8n workflow '${triggerName}': ${message}`);
        }
    }

    try {
        axios.post(url, payload).catch(err => {
            console.error(`Failed to trigger n8n workflow '${triggerName}':`, err.message);
        });
    } catch (err) {
        console.error('Error in triggerWorkflow:', err);
    }
};

module.exports = {
    triggerWorkflow
};
