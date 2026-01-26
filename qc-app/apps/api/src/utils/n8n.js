const axios = require('axios');

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://n8n:5678/webhook';

/**
 * Trigger an n8n workflow webhook
 * @param {string} triggerName - The webhook path/slug (e.g., 'task-created')
 * @param {object} payload - Data to send
 */
const triggerWorkflow = async (triggerName, payload) => {
    // If no webhook URL configured, skip
    if (!process.env.N8N_WEBHOOK_URL && process.env.NODE_ENV !== 'production') {
        console.log(`[Mock n8n] Triggered '${triggerName}'`, payload);
        return;
    }

    try {
        const url = `${N8N_WEBHOOK_URL}/${triggerName}`;
        // Fire and forget - don't await response to avoid blocking API
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
