ALTER TABLE `instruments` ADD `eastmoney_fee_bps` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `instruments` ADD `min_purchase_units` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `instruments` ADD `redemption_fee_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `instruments` ADD `data_source` text DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE `instruments` ADD `source_updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_entries` ADD `purchase_channel` text DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_entries` ADD `fee_source` text DEFAULT 'MANUAL' NOT NULL;