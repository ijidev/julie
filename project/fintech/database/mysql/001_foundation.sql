-- Fintech foundation schema for MySQL 8.4+ / InnoDB.
-- Select/create the destination database in your host or phpMyAdmin first.
-- This foundation contains only implemented persistence (migration evidence and
-- append-only audit events). Future versioned files will add real domain tables.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_events (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  actor_type VARCHAR(40) NOT NULL,
  actor_id VARCHAR(160) NULL,
  action VARCHAR(160) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(160) NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reason_code VARCHAR(100) NULL,
  metadata JSON NOT NULL,
  PRIMARY KEY (id),
  KEY audit_events_occurred_at_idx (occurred_at),
  KEY audit_events_actor_idx (actor_type, actor_id, occurred_at),
  KEY audit_events_resource_idx (resource_type, resource_id, occurred_at),
  CONSTRAINT audit_events_metadata_object_chk CHECK (JSON_TYPE(metadata) = 'OBJECT')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER $$

DROP TRIGGER IF EXISTS audit_events_reject_update$$
CREATE TRIGGER audit_events_reject_update
BEFORE UPDATE ON audit_events
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_events is append-only';
END$$

DROP TRIGGER IF EXISTS audit_events_reject_delete$$
CREATE TRIGGER audit_events_reject_delete
BEFORE DELETE ON audit_events
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_events is append-only';
END$$

DELIMITER ;

INSERT IGNORE INTO schema_migrations (version, checksum)
VALUES ('001_foundation', 'manual-mysql-import-v1');
