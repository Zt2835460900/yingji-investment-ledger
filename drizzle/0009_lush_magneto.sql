CREATE TABLE `company_watchlist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`market` text DEFAULT 'US' NOT NULL,
	`source` text DEFAULT 'AUTO' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`holding_rank` integer DEFAULT 0 NOT NULL,
	`estimated_weight_bps` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`last_discovered_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `company_watchlist_symbol_idx` ON `company_watchlist` (`symbol`);--> statement-breakpoint
CREATE INDEX `company_watchlist_status_rank_idx` ON `company_watchlist` (`status`,`holding_rank`);