-- Migration 045: Add tuleap_user_id column and seed all known Tuleap users as resources
-- Tuleap integer IDs are needed for assignment lookups from webhooks/API responses.
-- System accounts (id=100 noreply, id=101 admin) and duplicate login (id=112) are excluded.

BEGIN;

-- Add tuleap_user_id integer column (Tuleap uses integer IDs, not UUIDs)
ALTER TABLE resources
    ADD COLUMN IF NOT EXISTS tuleap_user_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_tuleap_user_id
    ON resources(tuleap_user_id) WHERE tuleap_user_id IS NOT NULL;

-- Backfill tuleap_user_id for the 4 resources that already exist
UPDATE resources SET tuleap_user_id = 115 WHERE tuleap_username = 'abdelrahman.gebril' AND tuleap_user_id IS NULL;
UPDATE resources SET tuleap_user_id = 105 WHERE tuleap_username = 'belal.z'            AND tuleap_user_id IS NULL;
UPDATE resources SET tuleap_user_id = 110 WHERE tuleap_username = 'hany.t'             AND tuleap_user_id IS NULL;
UPDATE resources SET tuleap_user_id = 103 WHERE tuleap_username = 'mahmoudy'           AND tuleap_user_id IS NULL;

-- Insert remaining Tuleap users (ON CONFLICT on tuleap_username to be idempotent)
INSERT INTO resources (resource_name, email, tuleap_username, tuleap_user_id, is_active, created_by)
VALUES
    ('Zyad Ashraf',          'zyad.ashraf@wind-is.com',         'zyad.a',              108, TRUE, 'system'),
    ('Omar Zahir',           'omar.zahir@wind-is.com',          'omar.zahir',          120, TRUE, 'system'),
    ('Omar Mohamed',         'omar.mohamed@wind-is.com',        'omar.mohamed',        117, TRUE, 'system'),
    ('Omar Badawy',          'omar.badawy@wind-is.com',         'omar.badawy',         118, TRUE, 'system'),
    ('Nada Rateb',           'nada.rateb@wind-is.com',          'nada.rateb',          122, TRUE, 'system'),
    ('Mohamed Salah',        'mohamed.salah@wind-is.com',       'mohamed.salah',       123, TRUE, 'system'),
    ('Mohamed Moustafa',     'mohamed.moustafa@wind-is.com',    'mohamed.moustafa',    114, TRUE, 'system'),
    ('Mohamed Galal',        'mohamed.galal@wind-is.com',       'mohamed.g',           107, TRUE, 'system'),
    ('Mohamed Abdelrahman',  'mohamed.abdelrahman@wind-is.com', 'mohamed.a',           106, TRUE, 'system'),
    ('Mahmoud Gamal',        'mahmoud.gamal@wind-is.com',       'mahmoud.gamal',       119, TRUE, 'system'),
    ('Mahmoud Abouelella',   'mahmoud.abouelella@wind-is.com',  'mahmoud.abouelella',  124, TRUE, 'system'),
    ('Karim Omar',           'karim.omar@wind-is.com',          'karim.o',             111, TRUE, 'system'),
    ('Islam Ihab',           'islam.ihab@wind-is.com',          'islam.ihab',          113, TRUE, 'system'),
    ('Doaa Idrees',          'doaa.idrees@wind-is.com',         'doaa',                102, TRUE, 'system'),
    ('Aly Mahmoud',          'aly.mahmoud@wind-is.com',         'aly.m',               109, TRUE, 'system'),
    ('Ali Elgendy',          'ali.elgendy@wind-is.com',         'ali.elgendy',         121, TRUE, 'system'),
    ('Abdulrahman Zaitoun',  'abdulrahman.zaitoun@wind-is.com', 'abdelrahmanz',        104, TRUE, 'system')
ON CONFLICT (tuleap_username) WHERE tuleap_username IS NOT NULL DO UPDATE
    SET tuleap_user_id = EXCLUDED.tuleap_user_id,
        email          = COALESCE(resources.email, EXCLUDED.email),
        updated_at     = CURRENT_TIMESTAMP;

COMMIT;
