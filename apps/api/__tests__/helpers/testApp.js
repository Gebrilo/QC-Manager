const express = require('express');

function createTestApp(mountPath, router) {
    const app = express();
    app.use(express.json());
    app.use(mountPath, router);
    return app;
}

module.exports = { createTestApp };
