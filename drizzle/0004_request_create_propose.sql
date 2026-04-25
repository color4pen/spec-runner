-- Add enabled column to requests table (nullable TEXT for JSON array storage)
ALTER TABLE `requests` ADD COLUMN `enabled` text;
