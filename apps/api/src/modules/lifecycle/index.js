const express = require('express');
const router = express.Router();

router.use('/journeys', require('./journeys.routes'));
router.use('/my-journeys', require('./myJourneys.routes'));
router.use('/development-plans', require('./developmentPlans.routes'));
router.use('/my-tasks', require('./personalTasks.routes'));

function mount(parentRouter) {
    parentRouter.use(router);
}

module.exports = { prefix: '/', mount };
