ALTER TABLE `users` ADD `provider` text DEFAULT 'github' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `provider_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `users` SET `provider_id` = CAST(`id` AS TEXT) WHERE `provider_id` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `users_provider_identity` ON `users` (`provider`,`provider_id`);