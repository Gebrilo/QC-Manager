const axios = require('axios');

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

const triggerWorkflow = async (triggerName, payload) => {
    if (!N8N_WEBHOOK_URL) {
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[Mock n8n] Triggered '${triggerName}'`, payload);
        }
        return;
    }

    try {
        const url = `${N8N_WEBHOOK_URL}/${triggerName}`;
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
