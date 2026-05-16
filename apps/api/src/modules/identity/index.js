const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/auth/profile', require('./avatar.routes'));
router.use('/me', require('./me.routes'));
router.use('/users', require('./users.routes'));
router.use('/roles', require('./roles.routes'));
router.use('/teams', require('./teams.routes'));
router.use('/notifications', require('./notifications.routes'));
router.use('/resources', require('./resources.routes'));

function mount(parentRouter) {
    parentRouter.use(router);
}

module.exports = { prefix: '/', mount };
