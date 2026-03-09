/**
 * Database and audit mock helpers for testing tuleapWebhook routes.
 * Mocks pool.query and auditLog to avoid needing a real database.
 */

const createMockPool = () => {
    const mockQuery = jest.fn();
    return {
        query: mockQuery,
        _resetMock: () => mockQuery.mockReset()
    };
};

const createMockAuditLog = () => jest.fn().mockResolvedValue(undefined);

/**
 * Setup Express app with the tuleapWebhook router for testing.
 * Mocks database and audit dependencies.
 */
function setupTestApp() {
    // Must mock modules BEFORE requiring the router
    const mockPool = createMockPool();
    const mockAuditLog = createMockAuditLog();

    // Mock the db module
    jest.mock('../../src/config/db', () => ({
        pool: mockPool
    }));

    // Mock the audit middleware
    jest.mock('../../src/middleware/audit', () => ({
        auditLog: mockAuditLog
    }));

    // Now require Express and the router
    const express = require('express');
    const app = express();
    app.use(express.json());

    // Require the router AFTER mocking
    const tuleapWebhookRouter = require('../../src/routes/tuleapWebhook');
    app.use('/tuleap-webhook', tuleapWebhookRouter);

    return { app, mockPool, mockAuditLog };
}

module.exports = {
    createMockPool,
    createMockAuditLog,
    setupTestApp
};
