const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load env FIRST before any other imports that use env vars
dotenv.config();

const errorHandler = require('./middleware/error');
const { runMigrations } = require('./config/db');
const { validatePermissionCatalog } = require('./rbac/validatePermissionCatalog');

const app = express();
const PORT = process.env.PORT || 3001;

validatePermissionCatalog();

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

const apiRouter = express.Router();
['identity', 'work', 'testing', 'quality', 'lifecycle', 'integration']
    .forEach(m => require(`./modules/${m}`).mount(apiRouter));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/api/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/api', apiRouter);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.get('/dashboard', (req, res) => res.status(410).json({ error: 'Deprecated', message: 'The /dashboard endpoint has been removed. Use /api/me/dashboard.' }));

// Error Handler (must be last)
app.use(errorHandler);

// Start
app.listen(PORT, () => {
    console.log(`API Server running on port ${PORT}`);
    // console.log(`Environment: ${process.env.NODE_ENV}`);
});
