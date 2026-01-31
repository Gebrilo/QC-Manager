const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const errorHandler = require('./middleware/error');
const { runMigrations } = require('./config/db');

// Load env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Run migrations on startup
runMigrations().catch(err => console.error('Migration failed:', err));

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/projects', require('./routes/projects'));
app.use('/tasks', require('./routes/tasks'));
app.use('/resources', require('./routes/resources'));
app.use('/test-cases', require('./routes/testCases')); // Phase 4: Test Cases CRUD
app.use('/test-executions', require('./routes/testExecutions')); // Phase 4: Test Runs & Executions
app.use('/dashboard', require('./routes/dashboard')); // Phase 4: Dashboard Metrics
app.use('/reports', require('./routes/reports')); // Phase 4: Report Generation
app.use('/', require('./routes/testResults')); // Test results upload and metrics
app.use('/testsprite', require('./routes/testspriteWebhook')); // TestSprite MCP integration
app.use('/governance', require('./routes/governance')); // Phase 2: Governance Dashboard

// Health
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Error Handler (must be last)
app.use(errorHandler);

// Start
app.listen(PORT, () => {
    console.log(`API Server running on port ${PORT}`);
    // console.log(`Environment: ${process.env.NODE_ENV}`);
});
