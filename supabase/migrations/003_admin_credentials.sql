-- =============================================================================
-- 003_admin_credentials.sql
-- Alienista Attendance System — Direct Admin Credentials in Organization Settings
-- =============================================================================

-- Add admin credentials to organization_settings (default: admin / admin123)
ALTER TABLE organization_settings 
  ADD COLUMN IF NOT EXISTS admin_username TEXT NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS admin_password_hash TEXT;

-- Seed default admin password hash (bcrypt for 'admin123') if empty
UPDATE organization_settings
SET admin_password_hash = '$2a$10$7Z8lRkn07GkOqX4XyN22ceQ1aF9oK77jUfZ65l2gDqV3mS.E0Xy4e'
WHERE admin_password_hash IS NULL;
