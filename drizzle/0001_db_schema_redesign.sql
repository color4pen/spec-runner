-- Create repositories table
CREATE TABLE IF NOT EXISTS `repositories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`full_name` text NOT NULL,
	`default_branch` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `repositories_user_id_full_name_unique` ON `repositories` (`user_id`, `full_name`);
--> statement-breakpoint
-- Create requests table
CREATE TABLE IF NOT EXISTS `requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Create sessions table
CREATE TABLE IF NOT EXISTS `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`managed_session_id` text NOT NULL,
	`role` text NOT NULL,
	`step` text,
	`status` text DEFAULT 'active' NOT NULL,
	`title` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Migrate data from user_sessions to new tables (idempotent with INSERT OR IGNORE)
-- Step 1: Create repositories from unique repo values in user_sessions
INSERT OR IGNORE INTO `repositories` (`user_id`, `owner`, `name`, `full_name`, `created_at`)
SELECT DISTINCT
	us.`user_id`,
	SUBSTR(us.`repo`, 1, INSTR(us.`repo`, '/') - 1) AS `owner`,
	SUBSTR(us.`repo`, INSTR(us.`repo`, '/') + 1) AS `name`,
	us.`repo` AS `full_name`,
	MIN(us.`created_at`) AS `created_at`
FROM `user_sessions` us
GROUP BY us.`user_id`, us.`repo`;
--> statement-breakpoint
-- Step 2: Create requests from each user_session
INSERT OR IGNORE INTO `requests` (`id`, `repository_id`, `type`, `status`, `title`, `content`, `created_at`, `updated_at`)
SELECT
	us.`id`,
	r.`id`,
	'new-feature',
	CASE
		WHEN us.`status` = 'archived' THEN 'completed'
		ELSE 'in-progress'
	END,
	us.`title`,
	NULL,
	us.`created_at`,
	us.`updated_at`
FROM `user_sessions` us
JOIN `repositories` r ON r.`user_id` = us.`user_id` AND r.`full_name` = us.`repo`;
--> statement-breakpoint
-- Step 3: Create sessions from each user_session
INSERT OR IGNORE INTO `sessions` (`id`, `request_id`, `managed_session_id`, `role`, `step`, `status`, `title`, `created_at`, `updated_at`)
SELECT
	us.`id`,
	us.`id`,
	us.`session_id`,
	'implementer',
	NULL,
	CASE
		WHEN us.`status` = 'archived' THEN 'archived'
		ELSE 'active'
	END,
	us.`title`,
	us.`created_at`,
	us.`updated_at`
FROM `user_sessions` us;
--> statement-breakpoint
-- Drop the old user_sessions table
DROP TABLE IF EXISTS `user_sessions`;
