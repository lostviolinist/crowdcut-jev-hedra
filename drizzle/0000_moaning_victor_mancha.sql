CREATE TABLE `live_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`round` integer NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`action` text,
	`cluster_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_live_comments_round_state` ON `live_comments` (`round`,`state`);--> statement-breakpoint
CREATE INDEX `idx_live_comments_user_round` ON `live_comments` (`user_id`,`round`);--> statement-breakpoint
CREATE TABLE `live_scenes` (
	`number` integer PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`video_key` text NOT NULL,
	`job_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `live_story` (
	`id` integer PRIMARY KEY NOT NULL,
	`running` integer DEFAULT 0 NOT NULL,
	`phase` text DEFAULT 'awaiting_frame' NOT NULL,
	`round` integer DEFAULT 1 NOT NULL,
	`scene_count` integer DEFAULT 0 NOT NULL,
	`job_id` text,
	`pending_action` text,
	`frame_key` text,
	`next_poll_at` integer DEFAULT 0 NOT NULL,
	`producer_seen_at` integer DEFAULT 0 NOT NULL,
	`error` text
);
