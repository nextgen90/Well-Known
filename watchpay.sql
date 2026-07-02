-- WatchPay Database Schema SQL Dump
-- Import this SQL file into your phpMyAdmin database (xgjowcyd_watch)

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `settings`;
DROP TABLE IF EXISTS `transactions`;
DROP TABLE IF EXISTS `bank_accounts`;
DROP TABLE IF EXISTS `users`;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. Create Users Table
CREATE TABLE `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `full_name` VARCHAR(255) NOT NULL,
    `mobile` VARCHAR(50) UNIQUE NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` VARCHAR(50) DEFAULT 'user',
    `balance` DOUBLE DEFAULT 0,
    `status` VARCHAR(50) DEFAULT 'active',
    `is_verified` INT DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `last_login` TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Create Bank Accounts Table
CREATE TABLE `bank_accounts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL,
    `account_type` VARCHAR(100) NOT NULL,
    `bank_name` VARCHAR(100) NOT NULL,
    `holder_name` VARCHAR(100) NOT NULL,
    `account_number` VARCHAR(100) NOT NULL,
    `ifsc_code` VARCHAR(100) NOT NULL,
    `branch_address` TEXT,
    `upi_id` VARCHAR(100),
    `status` VARCHAR(50) DEFAULT 'pending',
    `min_deposit` DOUBLE DEFAULT 5000,
    `auto_run` INT DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Create Transactions Table
CREATE TABLE `transactions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL,
    `account_id` INT,
    `type` VARCHAR(50) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `status` VARCHAR(50) DEFAULT 'pending',
    `remarks` TEXT,
    `admin_note` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `processed_at` TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`account_id`) REFERENCES `bank_accounts`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Create Settings Table
CREATE TABLE `settings` (
    `key` VARCHAR(100) PRIMARY KEY,
    `value` TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed Default Settings
INSERT INTO `settings` (`key`, `value`) VALUES 
('commission_rate', '10'),
('min_withdrawal', '2000'),
('banner_text', 'Note: Every transaction commission is 10%. Daily limit applies.'),
('saving_min', '5000'),
('current_min', '10000'),
('corporate_min', '15000')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

-- Seed Default Admin User (Mobile/User ID: admin, Password: admin123)
INSERT INTO `users` (`id`, `full_name`, `mobile`, `password_hash`, `role`, `balance`, `status`, `is_verified`) 
VALUES (1, 'Admin', 'admin', '$2a$10$TWcokCZ3KLgGAoEwB0BQYObE.qrG9wHxFg28hNvzPWryDJIUOTodW', 'admin', 0, 'active', 1)
ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`);
