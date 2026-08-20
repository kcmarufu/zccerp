-- Per-user display title override
--
-- Roles drive permissions; they are a poor fit for what a person is *called* on
-- an approval trail or a PDF. The General Secretary, for example, holds the
-- ADMIN role (super admin) but must never appear on paper as "Super
-- Administrator". job_title, when set, replaces the role label wherever a
-- person's title is displayed. It has no effect on permissions.

ALTER TABLE users
  ADD COLUMN job_title VARCHAR(100) NULL AFTER role_id;

-- Wilfred Dimingu — General Secretary (keeps the ADMIN role and all its rights)
UPDATE users SET job_title = 'General Secretary', updated_at = NOW()
 WHERE email = 'gensec@zccinzim.org';
