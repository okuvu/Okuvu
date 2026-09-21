-- OKUVU — Plumbing Fixes & Rationale v1.0, B2: run identity header. "A
-- result is only valid for the exact (build, model, prompt) it was produced
-- with." Nullable columns — populated on every run-creating router going
-- forward; existing rows keep NULL (their identity was simply not recorded,
-- which is exactly the gap this fixes).

ALTER TABLE "TestRun" ADD COLUMN "build_sha" TEXT,
                     ADD COLUMN "corpus_version" TEXT,
                     ADD COLUMN "run_mode" TEXT;
