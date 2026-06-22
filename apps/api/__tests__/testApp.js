'use strict';
/**
 * Shared test-app utilities for route integration tests.
 *
 * NOTE: Jest's module mocking requires all jest.mock() calls to be at the
 * top level of the test file (not inside helper functions). Consequently,
 * `setupTestApp` does NOT perform mocking — callers must declare their own
 * jest.mock() stubs before calling this helper.
 *
 * Usage pattern (see byIdHumanResolve.test.js for a full example):
 *   1. Declare jest.mock() stubs at the top of your test file.
 *   2. Import the router and call createTestApp() inside beforeAll/beforeEach.
 */

const express = require('express');

/**
 * Mount a single router on an Express app for integration testing.
 *
 * @param {string} mountPath   e.g. '/tasks'
 * @param {Router} router      Express router from routes/
 * @returns {Express}
 */
function createTestApp(mountPath, router) {
  const app = express();
  app.use(express.json());
  app.use(mountPath, router);
  return app;
}

module.exports = { createTestApp };
