-- Bootstrap DDL for a foc-observer database. Run by the provisioning one-shot
-- before the server starts, so the server never needs owner credentials.

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO foc_observer_query;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO foc_observer_query;
ALTER DEFAULT PRIVILEGES FOR ROLE ponder IN SCHEMA public
  GRANT SELECT ON TABLES TO foc_observer_query;

-- The grant above is blanket over public, but Ponder's bookkeeping (_ponder_meta,
-- _ponder_checkpoint, and _reorg__* on schemas not yet on the data_v* pattern)
-- lives there too and is not part of the exposed query surface. Match the
-- validator's blocked prefixes so the grant and the allow-list agree. Default
-- privileges re-grant these as Ponder recreates them, so this runs every time.
DO $$
DECLARE obj record;
BEGIN
  FOR obj IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'v', 'm', 'p')
      AND c.relname ~ '^(_ponder|ponder_|_reorg__)'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM foc_observer_query', obj.relname);
  END LOOP;
END $$;
