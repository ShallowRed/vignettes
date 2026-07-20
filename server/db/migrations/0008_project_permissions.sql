CREATE TABLE `project_permissions` (
	`project_slug` text NOT NULL,
	`user_id` integer NOT NULL,
	`role` text NOT NULL,
	`granted_by` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`project_slug`, `user_id`),
	FOREIGN KEY (`project_slug`) REFERENCES `projects`(`slug`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
