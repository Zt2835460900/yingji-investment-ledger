CREATE TABLE `paper_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`initial_cash_units` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `paper_trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`instrument_id` integer NOT NULL,
	`side` text NOT NULL,
	`trade_date` text NOT NULL,
	`quantity_units` integer NOT NULL,
	`price_units` integer NOT NULL,
	`fee_units` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `paper_trades_account_date_idx` ON `paper_trades` (`account_id`,`trade_date`);