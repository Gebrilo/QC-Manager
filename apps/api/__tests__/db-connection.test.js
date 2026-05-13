const { Pool } = require('pg');

describe('Database connection', () => {
    const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
    const itIfDatabaseUrl = databaseUrl ? it : it.skip;

    itIfDatabaseUrl('connects to Supabase and returns rows', async () => {
        const pool = new Pool({
            connectionString: databaseUrl,
            ssl: databaseUrl?.includes('supabase.co')
                ? { rejectUnauthorized: false }
                : undefined,
        });
        const result = await pool.query('SELECT 1 AS value');
        expect(result.rows[0].value).toBe(1);
        await pool.end();
    });
});
