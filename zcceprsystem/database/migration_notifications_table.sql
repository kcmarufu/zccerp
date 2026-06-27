-- ============================================================================
-- NOTIFICATIONS TABLE MIGRATION
-- Creates the notifications table used by the notification service.
-- Safe to run on a fresh or existing database (uses CREATE TABLE IF NOT EXISTS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id           INT          NOT NULL AUTO_INCREMENT,
  user_id      INT          NOT NULL,
  title        VARCHAR(255) NOT NULL,
  message      TEXT         NOT NULL,
  type         VARCHAR(50)  NOT NULL DEFAULT 'info',
  entity_type  VARCHAR(50)  NULL,
  entity_id    INT          NULL,
  link         VARCHAR(500) NULL,
  is_read      TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  INDEX idx_notifications_user_id      (user_id),
  INDEX idx_notifications_user_unread  (user_id, is_read),
  INDEX idx_notifications_created_at   (created_at),

  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
