CREATE TABLE `deck_draft_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`deck_slug` text NOT NULL,
	`raw` text NOT NULL,
	`authors` text NOT NULL,
	`label` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deck_slug`) REFERENCES `decks`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `deck_draft_snapshots_deck_slug_idx` ON `deck_draft_snapshots` (`deck_slug`);