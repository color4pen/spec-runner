-- Add bootstrap_status and bootstrap_pr_url columns to repositories table
-- SQLite does not support IF NOT EXISTS in ALTER TABLE ADD COLUMN prior to 3.37.0
-- The journal ensures this migration runs only once (idempotent via journal tracking)
ALTER TABLE `repositories` ADD COLUMN `bootstrap_status` text NOT NULL DEFAULT 'uninitialized';
--> statement-breakpoint
ALTER TABLE `repositories` ADD COLUMN `bootstrap_pr_url` text;
