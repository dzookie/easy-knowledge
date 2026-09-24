-- CreateTable
CREATE TABLE `user` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(32) NOT NULL,
    `password_hash` VARCHAR(100) NOT NULL,
    `nickname` VARCHAR(32) NULL,
    `email` VARCHAR(128) NULL,
    `phone` VARCHAR(20) NULL,
    `avatar` VARCHAR(255) NULL,
    `role_id` BIGINT NOT NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `last_login_at` DATETIME(3) NULL,
    `last_login_ip` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `user_username_key`(`username`),
    UNIQUE INDEX `user_email_key`(`email`),
    INDEX `user_role_id_idx`(`role_id`),
    INDEX `user_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `description` VARCHAR(255) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` TINYINT NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `role_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `menu` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `parent_id` BIGINT NOT NULL DEFAULT 0,
    `name` VARCHAR(64) NOT NULL,
    `type` TINYINT NOT NULL DEFAULT 2,
    `path` VARCHAR(128) NULL,
    `component` VARCHAR(128) NULL,
    `icon` VARCHAR(64) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `visible` TINYINT NOT NULL DEFAULT 1,
    `status` TINYINT NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `menu_parent_id_idx`(`parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_menu` (
    `role_id` BIGINT NOT NULL,
    `menu_id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `role_menu_menu_id_idx`(`menu_id`),
    PRIMARY KEY (`role_id`, `menu_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_base` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(500) NULL,
    `cover_image` VARCHAR(255) NULL,
    `embedding_model` VARCHAR(64) NOT NULL DEFAULT 'qllama/bge-m3:latest',
    `collection` VARCHAR(128) NOT NULL,
    `chunk_strategy` VARCHAR(32) NOT NULL DEFAULT 'recursive',
    `chunk_size` INTEGER NOT NULL DEFAULT 500,
    `chunk_overlap` INTEGER NOT NULL DEFAULT 50,
    `created_by` BIGINT NOT NULL,
    `document_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `chunk_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `visibility` TINYINT NOT NULL DEFAULT 0,
    `status` TINYINT NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `knowledge_base_collection_key`(`collection`),
    INDEX `knowledge_base_created_by_idx`(`created_by`),
    INDEX `knowledge_base_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `kb_id` BIGINT NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `storage_key` VARCHAR(512) NOT NULL,
    `size_bytes` BIGINT NOT NULL DEFAULT 0,
    `file_type` VARCHAR(16) NOT NULL,
    `status` TINYINT NOT NULL DEFAULT 0,
    `error_msg` VARCHAR(500) NULL,
    `chunk_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `total_chars` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `uploaded_by` BIGINT NOT NULL,
    `process_ms` INTEGER UNSIGNED NULL,
    `page_count` INTEGER UNSIGNED NULL,
    `started_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `finished_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,
    `deleted_by` BIGINT NULL,

    INDEX `document_kb_id_idx`(`kb_id`),
    INDEX `document_uploaded_by_idx`(`uploaded_by`),
    INDEX `document_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_chunk` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `document_id` BIGINT NOT NULL,
    `kb_id` BIGINT NOT NULL,
    `chunk_index` INTEGER NOT NULL DEFAULT 0,
    `content` TEXT NOT NULL,
    `chunk_type` VARCHAR(32) NOT NULL DEFAULT 'text',
    `position` VARCHAR(500) NULL,
    `parent_id` BIGINT NULL,
    `token_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `char_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `vector_id` VARCHAR(64) NOT NULL,
    `indexed` TINYINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `document_chunk_vector_id_key`(`vector_id`),
    INDEX `document_chunk_document_id_idx`(`document_id`),
    INDEX `document_chunk_kb_id_idx`(`kb_id`),
    INDEX `document_chunk_indexed_idx`(`indexed`),
    INDEX `document_chunk_document_id_chunk_index_idx`(`document_id`, `chunk_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_key` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(128) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `kb_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `call_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `token_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `daily_limit` INTEGER UNSIGNED NOT NULL DEFAULT 100,
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `api_key_key_key`(`key`),
    INDEX `api_key_kb_id_idx`(`kb_id`),
    INDEX `api_key_user_id_idx`(`user_id`),
    INDEX `api_key_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(500) NULL,
    `graph` LONGTEXT NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `status` TINYINT NOT NULL DEFAULT 0,
    `created_by` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `workflow_code_key`(`code`),
    INDEX `workflow_created_by_idx`(`created_by`),
    INDEX `workflow_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_run` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `workflow_id` BIGINT NOT NULL,
    `graph_snapshot` LONGTEXT NOT NULL,
    `inputs` TEXT NOT NULL,
    `outputs` TEXT NULL,
    `status` TINYINT NOT NULL DEFAULT 0,
    `error_msg` VARCHAR(1000) NULL,
    `node_trace` LONGTEXT NULL,
    `duration_ms` INTEGER UNSIGNED NULL,
    `total_tokens` INTEGER UNSIGNED NULL,
    `trigger` VARCHAR(16) NOT NULL DEFAULT 'manual',
    `executed_by` BIGINT NOT NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workflow_run_workflow_id_idx`(`workflow_id`),
    INDEX `workflow_run_status_idx`(`status`),
    INDEX `workflow_run_executed_by_idx`(`executed_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user` ADD CONSTRAINT `user_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_menu` ADD CONSTRAINT `role_menu_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_menu` ADD CONSTRAINT `role_menu_menu_id_fkey` FOREIGN KEY (`menu_id`) REFERENCES `menu`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `knowledge_base` ADD CONSTRAINT `knowledge_base_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document` ADD CONSTRAINT `document_kb_id_fkey` FOREIGN KEY (`kb_id`) REFERENCES `knowledge_base`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document` ADD CONSTRAINT `document_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_chunk` ADD CONSTRAINT `document_chunk_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_chunk` ADD CONSTRAINT `document_chunk_kb_id_fkey` FOREIGN KEY (`kb_id`) REFERENCES `knowledge_base`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `api_key` ADD CONSTRAINT `api_key_kb_id_fkey` FOREIGN KEY (`kb_id`) REFERENCES `knowledge_base`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `api_key` ADD CONSTRAINT `api_key_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow` ADD CONSTRAINT `workflow_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_run` ADD CONSTRAINT `workflow_run_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `workflow`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_run` ADD CONSTRAINT `workflow_run_executed_by_fkey` FOREIGN KEY (`executed_by`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
