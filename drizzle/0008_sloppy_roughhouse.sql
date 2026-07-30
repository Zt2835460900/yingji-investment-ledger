ALTER TABLE `recurring_plans` ADD `execution_mode` text DEFAULT 'MONTHLY_DATE' NOT NULL;--> statement-breakpoint
ALTER TABLE `recurring_plans` ADD `manual_daily_cap_units` integer DEFAULT 0 NOT NULL;