-- Local sandbox foundation. SQLite is not an approved production datastore.
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actor_type TEXT NOT NULL CHECK (length(actor_type) BETWEEN 1 AND 40),
  actor_id TEXT CHECK (actor_id IS NULL OR length(actor_id) <= 160),
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 160),
  resource_type TEXT NOT NULL CHECK (length(resource_type) BETWEEN 1 AND 100),
  resource_id TEXT CHECK (resource_id IS NULL OR length(resource_id) <= 160),
  request_id TEXT NOT NULL CHECK (length(request_id) = 36),
  reason_code TEXT CHECK (reason_code IS NULL OR length(reason_code) <= 100),
  metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata))
) STRICT;

CREATE INDEX audit_events_occurred_at_idx
  ON audit_events(occurred_at);
CREATE INDEX audit_events_actor_idx
  ON audit_events(actor_type, actor_id, occurred_at);
CREATE INDEX audit_events_resource_idx
  ON audit_events(resource_type, resource_id, occurred_at);

CREATE TRIGGER audit_events_reject_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;

CREATE TRIGGER audit_events_reject_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;
