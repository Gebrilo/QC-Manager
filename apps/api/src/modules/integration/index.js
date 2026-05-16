const express = require('express');
const router = express.Router();

const webhookHandler = require('./tuleapWebhook.routes');
const artifactsHandler = require('./tuleapArtifacts.routes');

router.use('/integration/tuleap/inbound', webhookHandler);
router.use('/integration/tuleap/outbound', artifactsHandler);

router.use('/tuleap-webhook', (req, res, next) => {
    console.warn('[DEPRECATED] /tuleap-webhook is deprecated — use /integration/tuleap/inbound');
    webhookHandler(req, res, next);
});
router.use('/tuleap/artifacts', (req, res, next) => {
    console.warn('[DEPRECATED] /tuleap/artifacts is deprecated — use /integration/tuleap/outbound');
    artifactsHandler(req, res, next);
});

function mount(parentRouter) {
    parentRouter.use(router);
}

module.exports = { prefix: '/', mount };
