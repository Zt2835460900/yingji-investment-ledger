CREATE TABLE `investment_journal` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer,
	`instrument_id` integer,
	`entry_date` text NOT NULL,
	`title` text NOT NULL,
	`decision` text DEFAULT 'REVIEW' NOT NULL,
	`mood` text DEFAULT 'CALM' NOT NULL,
	`thesis` text DEFAULT '' NOT NULL,
	`review_date` text DEFAULT '' NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `investment_journal_date_idx` ON `investment_journal` (`entry_date`);--> statement-breakpoint
CREATE INDEX `investment_journal_instrument_idx` ON `investment_journal` (`instrument_id`);