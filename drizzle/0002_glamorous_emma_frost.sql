ALTER TABLE `instruments` ADD `product_type` text DEFAULT 'FUND' NOT NULL;--> statement-breakpoint
ALTER TABLE `instruments` ADD `buy_fee_bps` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `instruments` ADD `buy_discount_bps` integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE `instruments` ADD `sell_fee_bps` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `instruments` ADD `min_fee_units` integer DEFAULT 0 NOT NULL;