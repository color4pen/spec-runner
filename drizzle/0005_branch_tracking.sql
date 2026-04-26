-- Add branch_name and base_branch columns to requests table
ALTER TABLE `requests` ADD COLUMN `branch_name` text;
--> statement-breakpoint
ALTER TABLE `requests` ADD COLUMN `base_branch` text;
