const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load env FIRST before any other imports that use env vars
dotenv.config();

const errorHandler = require('./middleware/error');
const { runMigrations } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3001;

// Run migrations on startup
runMigrations().catch(err => console.error('Migration failed:', err));

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));
app.use(express.json());

// Create API router for all routes (supports both / and /api prefixes)
const apiRouter = express.Router();
apiRouter.use('/projects', require('./routes/projects'));
apiRouter.use('/tasks', require('./routes/tasks'));
apiRouter.use('/resources', require('./routes/resources'));
apiRouter.use('/test-cases', require('./routes/testCases'));
apiRouter.use('/test-executions', require('./routes/testExecutions'));
apiRouter.use('/dashboard', require('./routes/dashboard'));
apiRouter.use('/reports', require('./routes/reports'));
apiRouter.use('/', require('./routes/testResults'));
apiRouter.use('/testsprite', require('./routes/testspriteWebhook'));
apiRouter.use('/governance', require('./routes/governance'));
apiRouter.use('/auth', require('./routes/auth'));
apiRouter.use('/users', require('./routes/users'));
apiRouter.use('/notifications', require('./routes/notifications'));
apiRouter.use('/bugs', require('./routes/bugs'));
apiRouter.use('/tuleap-webhook', require('./routes/tuleapWebhook'));
apiRouter.use('/my-tasks', require('./routes/personalTasks'));
apiRouter.use('/roles', require('./routes/roles'));
apiRouter.use('/journeys', require('./routes/journeys'));
apiRouter.use('/my-journeys', require('./routes/myJourneys'));
apiRouter.use('/manager', require('./routes/managerView'));
apiRouter.use('/teams', require('./routes/teams'));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/api/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Mount routes at both root and /api for compatibility
app.use('/', apiRouter);
app.use('/api', apiRouter);

// Health check (available at both /health and /api/health)
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Error Handler (must be last)
app.use(errorHandler);

// Start
app.listen(PORT, () => {
    console.log(`API Server running on port ${PORT}`);
    // console.log(`Environment: ${process.env.NODE_ENV}`);
});
