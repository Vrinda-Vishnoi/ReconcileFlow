-- Audit log immutability trigger
-- Blocks UPDATE and DELETE on audit_log table
-- This is applied AFTER Prisma migrations via raw SQL

CREATE OR REPLACE FUNCTION prevent_audit_changes()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only — UPDATE and DELETE are prohibited';
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (idempotent)
DROP TRIGGER IF EXISTS no_update_audit ON audit_log;

-- Create trigger to block UPDATE and DELETE
CREATE TRIGGER no_update_audit
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_changes();
