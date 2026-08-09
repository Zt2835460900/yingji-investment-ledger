CREATE TABLE `position_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`instrument_id` integer NOT NULL,
	`quantity_units` integer NOT NULL,
	`cost_units` integer NOT NULL,
	`as_of_date` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `position_overrides_account_instrument_idx` ON `position_overrides` (`account_id`,`instrument_id`);--> statement-breakpoint
CREATE INDEX `position_overrides_date_idx` ON `position_overrides` (`as_of_date`);