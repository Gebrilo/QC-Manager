const express = require('express');
const router = express.Router();
const { handleTestSpriteWebhook } = require('../integrations/testsprite');

/**
 * TestSprite Webhook Endpoints
 *
 * These endpoints receive automated test results from TestSprite MCP
 * and upload them to the QC Management Tool.
 */

// POST /testsprite/webhook - Receive TestSprite results
router.post('/webhook', handleTestSpriteWebhook);

// GET /testsprite/status - Health check for TestSprite integration
router.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    integration: 'TestSprite MCP',
    version: '1.0.0',
    webhook_url: '/testsprite/webhook',
    supported_formats: [
      'TestSprite MCP results',
      'Jest format',
      'Mocha format',
      'Generic test results'
    ]
  });
});

module.exports = router;
