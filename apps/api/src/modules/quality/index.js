const express = require('express');
const router = express.Router();

router.use('/governance', require('./governance.routes'));
router.use('/reports', require('./reports.routes'));

function mount(parentRouter) {
    parentRouter.use(router);
}

module.exports = { prefix: '/', mount };
