CREATE TABLE `deck_media` (
	`media_name` text NOT NULL,
	`deck_slug` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`media_name`, `deck_slug`),
	FOREIGN KEY (`deck_slug`) REFERENCES `decks`(`slug`) ON UPDATE no action ON DELETE no action
);
