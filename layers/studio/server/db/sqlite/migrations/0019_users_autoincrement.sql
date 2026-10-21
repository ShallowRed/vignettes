PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text DEFAULT 'github' NOT NULL,
	`provider_id` text DEFAULT '' NOT NULL,
	`login` text NOT NULL,
	`name` text,
	`avatar_url` text,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "provider", "provider_id", "login", "name", "avatar_url", "role", "created_at", "last_login_at") SELECT "id", "provider", "provider_id", "login", "name", "avatar_url", "role", "created_at", "last_login_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_login_unique` ON `users` (`login`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_provider_identity` ON `users` (`provider`,`provider_id`);