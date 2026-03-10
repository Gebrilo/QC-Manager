const { Pool } = require('pg');

describe('Database connection', () => {
    it('connects and returns rows from pg_tables', async () => {
        const pool = new Pool(
            process.env.DATABASE_URL
                ? {
                    connectionString: process.env.DATABASE_URL,
                    ssl: process.env.DATABASE_URL?.includes('supabase.co')
                        ? { rejectUnauthorized: false }
                        : undefined,
                  }
                : {
                    user: process.env.POSTGRES_USER || 'postgres',
                    host: process.env.POSTGRES_HOST || 'localhost',
                    database: process.env.POSTGRES_DB || 'qc_app',
                    password: process.env.POSTGRES_PASSWORD || 'postgres',
                    port: parseInt(process.env.POSTGRES_PORT, 10) || 5432,
                  }
        );
        const result = await pool.query('SELECT 1 AS value');
        expect(result.rows[0].value).toBe(1);
        await pool.end();
    });
});
