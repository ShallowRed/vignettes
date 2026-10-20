CREATE TABLE `deck_aliases` (
	`alias` text PRIMARY KEY NOT NULL,
	`deck_slug` text NOT NULL,
	FOREIGN KEY (`deck_slug`) REFERENCES `decks`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `deck_permissions` (
	`deck_slug` text NOT NULL,
	`user_id` integer NOT NULL,
	`role` text NOT NULL,
	`granted_by` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`deck_slug`, `user_id`),
	FOREIGN KEY (`deck_slug`) REFERENCES `decks`(`slug`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`slug` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`color` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`login` text NOT NULL,
	`name` text,
	`avatar_url` text,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_login_unique` ON `users` (`login`);--> statement-breakpoint
ALTER TABLE `decks` ADD `unlisted` integer DEFAULT false NOT NULL;