-- Bootstrap DDL for a foc-observer database. Run by the provisioning one-shot
-- before the server starts, so the server never needs owner credentials.

-- tx_meta and its index read Ponder's sync tables, which do not exist until the
-- indexer's first run. Skip them on an unpopulated database rather than fail the
-- one-shot, which would block the server from starting at all. `docker compose
-- up -d` re-runs the one-shot, so the view lands on the next deploy once Ponder
-- has populated ponder_sync.
DO $$
BEGIN
  IF to_regclass('ponder_sync.transactions') IS NULL THEN
    RAISE NOTICE 'ponder_sync not populated yet; skipping tx_meta';
    RETURN;
  END IF;

  -- Hash index is the only entry point into tx_meta by tx_hash; ponder_sync
  -- tables are keyed (chain_id, block_number, transaction_index) and a JOIN
  -- by hash seq-scans millions of rows without it. USING hash: equality-only
  -- and far smaller than a btree over 66-char hex strings. ~10s to build on
  -- 15M rows, no-op after the first run.
  CREATE INDEX IF NOT EXISTS transactions_hash_hash_idx
    ON ponder_sync.transactions USING hash (hash);

  -- CREATE OR REPLACE VIEW only permits appending columns, not reordering or
  -- renaming. New columns must go at the end of the SELECT list.
  -- Receipts and blocks join via the ponder_sync primary keys; only the
  -- transactions lookup needs the hash index above.
  CREATE OR REPLACE VIEW public.tx_meta AS
  SELECT
    t.hash                AS tx_hash,
    t."to"                AS tx_to,
    LEFT(t.input, 10)     AS tx_selector,
    t."from"              AS tx_from,
    t.value               AS tx_value,
    t.block_number        AS block_number,
    r.gas_used            AS gas_used,
    r.effective_gas_price AS effective_gas_price,
    r.status              AS status,
    b.timestamp           AS timestamp
  FROM ponder_sync.transactions t
  JOIN ponder_sync.transaction_receipts r
    ON r.chain_id = t.chain_id
    AND r.block_number = t.block_number
    AND r.transaction_index = t.transaction_index
  JOIN ponder_sync.blocks b
    ON b.chain_id = t.chain_id AND b.number = t.block_number;
END $$;

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
