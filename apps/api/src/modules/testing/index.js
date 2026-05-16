const express = require('express');
const router = express.Router();

const testRuns = require('./test-runs.routes');

router.use('/test-cases', require('./testCases.routes'));
router.use('/test-suites', require('./testSuites.routes'));
router.use('/test-executions', testRuns.executionsRouter);
router.use('/', testRuns.resultsRouter);
router.use('/testsprite', require('./testspriteWebhook.routes'));

function mount(parentRouter) {
    parentRouter.use(router);
}

module.exports = { prefix: '/', mount };
