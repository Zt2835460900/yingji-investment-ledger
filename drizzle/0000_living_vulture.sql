CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`cost_method` text DEFAULT 'MOVING_AVERAGE' NOT NULL,
	`color` text DEFAULT '#5B7CFA' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `allocation_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instrument_id` integer NOT NULL,
	`target_bps` integer NOT NULL,
	`alert_bps` integer DEFAULT 500 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `allocation_instrument_idx` ON `allocation_targets` (`instrument_id`);--> statement-breakpoint
CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `instruments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`market` text DEFAULT 'CN' NOT NULL,
	`asset_class` text DEFAULT 'OTHER' NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instruments_code_idx` ON `instruments` (`code`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`instrument_id` integer,
	`kind` text NOT NULL,
	`trade_date` text NOT NULL,
	`quantity_units` integer DEFAULT 0 NOT NULL,
	`price_units` integer DEFAULT 0 NOT NULL,
	`gross_amount_units` integer DEFAULT 0 NOT NULL,
	`fee_units` integer DEFAULT 0 NOT NULL,
	`tax_units` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`external_ref` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instrument_id` integer NOT NULL,
	`price_date` text NOT NULL,
	`price_units` integer NOT NULL,
	`source` text DEFAULT 'MANUAL' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prices_instrument_date_idx` ON `prices` (`instrument_id`,`price_date`);--> statement-breakpoint
CREATE TABLE `recurring_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`instrument_id` integer NOT NULL,
	`amount_units` integer NOT NULL,
	`frequency` text DEFAULT 'MONTHLY' NOT NULL,
	`day_of_month` integer DEFAULT 1 NOT NULL,
	`next_date` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
