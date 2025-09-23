CREATE TABLE `Case_Events` (
	`id` varchar(36) NOT NULL,
	`case_id` varchar(7) NOT NULL,
	`event_type` text NOT NULL,
	`occurred_at` timestamp NOT NULL DEFAULT (now()),
	`details` text,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `Case_Events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cases` (
	`case_id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`case_creation_date` timestamp DEFAULT (now()),
	`last_case_status` varchar(255) NOT NULL DEFAULT 'pending',
	`last_status_date` timestamp DEFAULT (now()),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `cases_case_id` PRIMARY KEY(`case_id`)
);
--> statement-breakpoint
CREATE TABLE `client_files` (
	`id` varchar(36) NOT NULL,
	`client_id` int NOT NULL,
	`file_name` varchar(500) NOT NULL,
	`original_file_name` varchar(500) NOT NULL,
	`file_size` varchar(20) NOT NULL,
	`mime_type` varchar(255) NOT NULL,
	`description` text,
	`upload_date` timestamp DEFAULT (now()),
	`file_path` varchar(1000) NOT NULL,
	`uploaded_by_type` varchar(10) NOT NULL DEFAULT 'client',
	`admin_viewed` boolean NOT NULL DEFAULT false,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `client_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`client_id` int AUTO_INCREMENT NOT NULL,
	`first_name` varchar(255) NOT NULL,
	`last_name` varchar(255) NOT NULL,
	`national_id` varchar(10) NOT NULL,
	`phone_numbers` json NOT NULL,
	`password` varchar(255),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `clients_client_id` PRIMARY KEY(`client_id`),
	CONSTRAINT `clients_national_id_unique` UNIQUE(`national_id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` varchar(36) NOT NULL,
	`first_name` varchar(255) NOT NULL,
	`last_name` varchar(255) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`email` varchar(255),
	`subject` varchar(500) NOT NULL,
	`message` text NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` varchar(36) NOT NULL,
	`client_id` int NOT NULL,
	`sender_role` varchar(10) NOT NULL,
	`message_content` text NOT NULL,
	`is_read` varchar(5),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`username` varchar(255) NOT NULL,
	`password` varchar(255) NOT NULL,
	`email` varchar(255),
	`role` varchar(50) NOT NULL DEFAULT 'client',
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`)
);
