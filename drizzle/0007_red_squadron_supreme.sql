CREATE TABLE `fund_purchase_limits` (
	`instrument_id` integer PRIMARY KEY NOT NULL,
	`purchase_status` text DEFAULT 'UNKNOWN' NOT NULL,
	`daily_limit_units` integer DEFAULT 0 NOT NULL,
	`auto_sync` integer DEFAULT 1 NOT NULL,
	`source` text DEFAULT 'MANUAL' NOT NULL,
	`source_updated_at` text DEFAULT '' NOT NULL
);
