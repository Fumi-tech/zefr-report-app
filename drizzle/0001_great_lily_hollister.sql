CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportId` varchar(64) NOT NULL,
	`userId` int,
	`clientName` varchar(255) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`reportData` text NOT NULL,
	`performanceFileKey` varchar(512),
	`riskFileKey` varchar(512),
	`viewFileKey` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `reports_reportId_unique` UNIQUE(`reportId`)
);
