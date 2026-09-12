CREATE TABLE `deck_drafts` (
	`deck_slug` text PRIMARY KEY NOT NULL,
	`ydoc` blob NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`deck_slug`) REFERENCES `decks`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `deck_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`deck_slug` text NOT NULL,
	`raw` text NOT NULL,
	`published_by` text NOT NULL,
	`published_at` integer NOT NULL,
	FOREIGN KEY (`deck_slug`) REFERENCES `decks`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `decks` (
	`slug` text PRIMARY KEY NOT NULL,
	`alias` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'private' NOT NULL,
	`lifecycle` text DEFAULT 'live' NOT NULL,
	`project` text,
	`theme` text,
	`access_password_hash` text,
	`frozen_bundle` text,
	`published_version_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decks_alias_unique` ON `decks` (`alias`);