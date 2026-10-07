-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `passwordHash` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Patient` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `phoneNumber` VARCHAR(10) NOT NULL,
    `birthDate` DATE NOT NULL,
    `hasLine` BOOLEAN NOT NULL DEFAULT true,
    `comment` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Patient_name_birthDate_key`(`name`, `birthDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Visit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `patientId` INTEGER NOT NULL,
    `visitDate` DATE NOT NULL,
    `note` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Visit_patientId_visitDate_key`(`patientId`, `visitDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Recall` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `patientId` INTEGER NOT NULL,
    `visitId` INTEGER NOT NULL,
    `dueDate` DATE NOT NULL,
    `step` ENUM('NOT_CONTACTED', 'LINE_SENT', 'CALLED_1', 'CALLED_2', 'CALLED_3') NOT NULL DEFAULT 'NOT_CONTACTED',
    `status` ENUM('PENDING', 'CONFIRMED', 'UNREACHABLE', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    `lineSentAt` DATE NULL,
    `call1At` DATE NULL,
    `call2At` DATE NULL,
    `call3At` DATE NULL,
    `confirmedAt` DATE NULL,
    `onHold` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Recall_visitId_key`(`visitId`),
    INDEX `Recall_status_onHold_idx`(`status`, `onHold`),
    INDEX `Recall_patientId_idx`(`patientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecallEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recallId` INTEGER NOT NULL,
    `type` ENUM('ACTION', 'MANUAL_EDIT', 'UNDO', 'VISIT_RECORDED', 'RESTART') NOT NULL,
    `action` VARCHAR(20) NULL,
    `note` VARCHAR(500) NULL,
    `before` JSON NOT NULL,
    `after` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RecallEvent_recallId_id_idx`(`recallId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClinicSetting` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `recallIntervalMonths` INTEGER NOT NULL DEFAULT 6,
    `lineLeadDays` INTEGER NOT NULL DEFAULT 7,
    `callAfterLineDays` INTEGER NOT NULL DEFAULT 3,
    `callGapDays` INTEGER NOT NULL DEFAULT 2,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Visit` ADD CONSTRAINT `Visit_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `Patient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recall` ADD CONSTRAINT `Recall_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `Patient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recall` ADD CONSTRAINT `Recall_visitId_fkey` FOREIGN KEY (`visitId`) REFERENCES `Visit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecallEvent` ADD CONSTRAINT `RecallEvent_recallId_fkey` FOREIGN KEY (`recallId`) REFERENCES `Recall`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
