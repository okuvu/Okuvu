-- OKUVU — Plumbing Fixes & Rationale v1.0, B1: a run where any pipeline
-- stage failed or no-oped is marked incomplete/excluded, never clean.

ALTER TYPE "TestRunStatus" ADD VALUE IF NOT EXISTS 'incomplete' AFTER 'error';
