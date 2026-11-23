-- Apply the query role's exact public-view allow-list. The event trigger runs
-- as the view creator, so only Ponder's owner-published views receive grants.
BEGIN;
\ir public-relations.sql

CREATE SCHEMA IF NOT EXISTS foc_observer_config;
DROP TABLE IF EXISTS foc_observer_config.query_role;
DROP TABLE IF EXISTS foc_observer_config.publisher_role;
REVOKE ALL PRIVILEGES ON SCHEMA foc_observer_config FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA foc_observer_config FROM foc_observer_query;
CREATE TABLE IF NOT EXISTS foc_observer_config.allowed_public_view (name name PRIMARY KEY);
TRUNCATE foc_observer_config.allowed_public_view;
INSERT INTO foc_observer_config.allowed_public_view (name)
  SELECT name FROM foc_observer_allowed_relation;

DO $$
BEGIN
  IF current_user <> 'ponder' THEN
    RAISE EXCEPTION 'bootstrap must run as the trusted Ponder owner';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION foc_observer_config.is_trusted_public_view(
  view_oid oid,
  expected_name name
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pg_class view_relation
    JOIN pg_namespace view_namespace ON view_namespace.oid = view_relation.relnamespace
    JOIN pg_rewrite rewrite_rule ON rewrite_rule.ev_class = view_relation.oid
    JOIN pg_depend dependency ON dependency.classid = 'pg_rewrite'::regclass
      AND dependency.objid = rewrite_rule.oid
      AND dependency.refclassid = 'pg_class'::regclass
      AND dependency.deptype = 'n'
    JOIN pg_class source_relation ON source_relation.oid = dependency.refobjid
    JOIN pg_namespace source_namespace ON source_namespace.oid = source_relation.relnamespace
    WHERE view_relation.oid = view_oid
      AND view_namespace.nspname = 'public'
      AND view_relation.relkind = 'v'
      AND view_relation.relowner = 'ponder'::regrole
      AND source_namespace.nspname ~ '^data_v[0-9]+$'
      AND source_relation.relkind IN ('r', 'p')
      AND source_relation.relname = expected_name
      AND source_relation.relowner = 'ponder'::regrole
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend other_dependency
        WHERE other_dependency.classid = 'pg_rewrite'::regclass
          AND other_dependency.objid = rewrite_rule.oid
          AND other_dependency.refclassid = 'pg_class'::regclass
          AND other_dependency.deptype = 'n'
          AND other_dependency.refobjid <> source_relation.oid
      )
      AND btrim(regexp_replace(pg_get_viewdef(view_relation.oid, true), '\s+', ' ', 'g')) = (
        SELECT format(
          'SELECT %s FROM %I.%I;',
          string_agg(format('%I', attribute.attname), ', ' ORDER BY attribute.attnum),
          source_namespace.nspname,
          source_relation.relname
        )
        FROM pg_attribute attribute
        WHERE attribute.attrelid = source_relation.oid
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
      )
  )
$$;
REVOKE ALL PRIVILEGES ON FUNCTION foc_observer_config.is_trusted_public_view(oid, name) FROM PUBLIC;

CREATE OR REPLACE FUNCTION foc_observer_config.grant_public_view_select()
RETURNS event_trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  command record;
  view_name name;
BEGIN
  FOR command IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    SELECT c.relname INTO view_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN foc_observer_config.allowed_public_view allowed ON allowed.name = c.relname
    WHERE c.oid = command.objid AND n.nspname = 'public' AND c.relkind = 'v';
    IF FOUND THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM foc_observer_query', view_name);
      IF foc_observer_config.is_trusted_public_view(command.objid, view_name) THEN
        EXECUTE format('GRANT SELECT ON TABLE public.%I TO foc_observer_query', view_name);
      END IF;
    END IF;
  END LOOP;
END $$;
REVOKE ALL PRIVILEGES ON FUNCTION foc_observer_config.grant_public_view_select() FROM PUBLIC;
DROP EVENT TRIGGER IF EXISTS foc_observer_grant_public_view_select;
CREATE EVENT TRIGGER foc_observer_grant_public_view_select
  ON ddl_command_end
  WHEN TAG IN ('CREATE VIEW')
  EXECUTE FUNCTION foc_observer_config.grant_public_view_select();
DROP FUNCTION IF EXISTS foc_observer_config.is_trusted_public_view(oid, name, name);

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE ponder IN SCHEMA public
  REVOKE SELECT ON TABLES FROM foc_observer_query;

DO $$
DECLARE
  relation record;
  column_name name;
  parent_role name;
BEGIN
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());


  FOR parent_role IN
    SELECT parent.rolname
    FROM pg_auth_members membership
    JOIN pg_roles parent ON parent.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    WHERE member.rolname = 'foc_observer_query'
  LOOP
    EXECUTE format('REVOKE %I FROM foc_observer_query', parent_role);
  END LOOP;

  EXECUTE format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM foc_observer_query', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO foc_observer_query', current_database());
  REVOKE ALL PRIVILEGES ON SCHEMA public FROM foc_observer_query;
  GRANT USAGE ON SCHEMA public TO foc_observer_query;

  FOR relation IN
    SELECT c.oid, c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  LOOP
    IF relation.relkind = 'S' THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM foc_observer_query', relation.relname);
    ELSE
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM foc_observer_query', relation.relname);
      FOR column_name IN
        SELECT attname
        FROM pg_attribute
        WHERE attrelid = relation.oid AND attnum > 0 AND NOT attisdropped
      LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM foc_observer_query', column_name, relation.relname);
      END LOOP;
    END IF;
  END LOOP;

  FOR relation IN
    SELECT c.oid, c.relname
    FROM foc_observer_config.allowed_public_view allowed
    JOIN pg_class c ON c.relname = allowed.name
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
  LOOP
    IF foc_observer_config.is_trusted_public_view(relation.oid, relation.relname) THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO foc_observer_query', relation.relname);
    END IF;
  END LOOP;
END $$;
COMMIT;
