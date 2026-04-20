-- Migration: Add ADMIN role and create system administrator user
-- Purpose: Create a dedicated admin role with full system oversight
-- Date: 2026-02-11

USE finance_erp;

-- Add ADMIN role to roles table
INSERT INTO roles (role_name, role_description) 
VALUES ('ADMIN', 'System Administrator with full oversight and control')
ON DUPLICATE KEY UPDATE role_description = 'System Administrator with full oversight and control';

-- Create admin user (password: Admin@12345)
-- Password hash for: Admin@12345
INSERT INTO users (
    employee_id,
    email, 
    password_hash, 
    first_name, 
    last_name, 
    role_id, 
    department_id, 
    is_active,
    created_at,
    updated_at
)
SELECT 
    'ADMIN001',
    'admin@zccinzim.org',
    '$2a$12$LQz8VHpXKzH5rJ5YfHx5PesVqRuJ6MBw5J.Wz5qVx7vNZy3hq4aYi', -- Admin@12345
    'System',
    'Administrator',
    (SELECT id FROM roles WHERE role_name = 'ADMIN' LIMIT 1),
    (SELECT id FROM departments WHERE department_code = 'IT' LIMIT 1),
    TRUE,
    NOW(),
    NOW()
FROM DUAL
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE email = 'admin@zccinzim.org'
);

-- Update existing FINANCE_CLERK users to maintain their admin privileges
-- (Optional: You can keep finance@zccinzim.org as FINANCE_CLERK with admin access)

COMMIT;

-- Verification queries
SELECT 'Roles Table:' as Info;
SELECT id, role_name, role_description FROM roles ORDER BY id;

SELECT 'Admin User:' as Info;
SELECT 
    u.id, 
    u.email, 
    u.first_name, 
    u.last_name, 
    r.role_name, 
    d.department_name,
    u.is_active
FROM users u
JOIN roles r ON u.role_id = r.id
LEFT JOIN departments d ON u.department_id = d.id
WHERE u.email = 'admin@zccinzim.org';

-- Instructions:
-- 1. Run this script in your MySQL database
-- 2. Login credentials:
--    Email: admin@zccinzim.org
--    Password: Admin@12345
-- 3. IMPORTANT: Change the password immediately after first login
