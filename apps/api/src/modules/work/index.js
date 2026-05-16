const express = require('express');
const router = express.Router();

const links = require('./links.routes');

router.use('/projects', require('./projects.routes'));
router.use('/tasks', require('./tasks.routes'));
router.use('/user-stories', require('./userStories.routes'));
router.use('/bugs', require('./bugs.routes'));
router.use('/search', require('./search.routes'));
router.use('/tasks', links.taskSide);
router.use('/test-cases', links.tcSide);
router.use('/bugs', links.bugSide);
router.use('/user-stories', links.storySide);

function mount(parentRouter) {
    parentRouter.use(router);
}

module.exports = { prefix: '/', mount };
