const errorHandler = (err, req, res, next) => {
    // Zod Validation Errors
    if (err.name === 'ZodError') {
        return res.status(400).json({
            error: 'Validation Error',
            details: err.errors
        });
    }

    // Database Errors (Postgres)
    if (err.code && typeof err.code === 'string' && err.code.startsWith('23')) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Conflict: Record already exists' });
        }
        return res.status(400).json({ error: 'Database constraint violation', code: err.code });
    }

    // Log non-validation errors
    console.error('[ERROR]', err.message || err);

    // Default
    const status = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(status).json({
        error: message,
        requestId: req.headers['x-request-id']
    });
};

module.exports = errorHandler;
