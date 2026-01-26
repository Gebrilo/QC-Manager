const { Pool } = require('pg');

const pool = new Pool(
    process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            user: process.env.POSTGRES_USER || 'qc_user',
            host: process.env.POSTGRES_HOST || 'postgres',
            database: process.env.POSTGRES_DB || 'qc_management',
            password: process.env.POSTGRES_PASSWORD || 'dev_password',
            port: process.env.POSTGRES_PORT || 5432,
        }
);

// Test connection
pool.on('connect', () => {
    // console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};
