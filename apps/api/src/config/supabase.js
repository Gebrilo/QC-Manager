const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseAdmin = null;

if (supabaseUrl && supabaseServiceRoleKey) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
} else {
    console.warn('[Supabase Admin] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. Supabase admin features disabled.');
}

module.exports = { supabaseAdmin };
