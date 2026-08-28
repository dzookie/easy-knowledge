-- ============================================================
-- Easy-Knowledge 数据库完整建表脚本
-- 一键执行: mysql -u root -p < schema.sql
--
-- 执行后包含:
--   - 数据库 easy_knowledge
--   - 16 张表 (user/role/menu/permission + 关联表 + 业务表)
--   - 默认 admin 用户 (用户名 admin / 密码 admin123)
--   - 默认角色 (admin / user)
-- ============================================================

-- ============================================================
-- 0. 创建数据库
-- ============================================================
CREATE DATABASE IF NOT EXISTS `easy_knowledge`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `easy_knowledge`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. 用户表
-- ============================================================
DROP TABLE IF EXISTS `user`;
CREATE TABLE `user` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT,
  `username`      VARCHAR(32)  NOT NULL,
  `password_hash` VARCHAR(100) NOT NULL,
  `nickname`      VARCHAR(32)  DEFAULT NULL,
  `email`         VARCHAR(128) DEFAULT NULL,
  `phone`         VARCHAR(20)  DEFAULT NULL,
  `avatar`        VARCHAR(255) DEFAULT NULL,
  `role`          ENUM('ADMIN','USER') NOT NULL DEFAULT 'USER',
  `status`        TINYINT      NOT NULL DEFAULT 1 COMMENT '1启用 0禁用',
  `last_login_at` DATETIME     DEFAULT NULL,
  `last_login_ip` VARCHAR(45)  DEFAULT NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`    DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_username` (`username`),
  UNIQUE KEY `uk_user_email` (`email`),
  KEY `idx_user_role` (`role`),
  KEY `idx_user_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- ============================================================
-- 2. RBAC 权限模块
-- ============================================================

-- 2.1 角色表
DROP TABLE IF EXISTS `role`;
CREATE TABLE `role` (
  `id`          BIGINT      NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(32) NOT NULL COMMENT '角色编码: admin / user',
  `name`        VARCHAR(64) NOT NULL COMMENT '角色名称',
  `description` VARCHAR(255) DEFAULT NULL,
  `sort`        INT         NOT NULL DEFAULT 0,
  `status`      TINYINT     NOT NULL DEFAULT 1 COMMENT '1启用 0禁用',
  `created_at`  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`  DATETIME    DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表';

-- 2.2 菜单表 (含按钮权限点)
DROP TABLE IF EXISTS `menu`;
CREATE TABLE `menu` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT,
  `parent_id`   BIGINT       NOT NULL DEFAULT 0 COMMENT '父菜单ID, 0为根',
  `name`        VARCHAR(64)  NOT NULL COMMENT '菜单名称',
  `type`        TINYINT      NOT NULL DEFAULT 1 COMMENT '1目录 2菜单 3按钮',
  `path`        VARCHAR(128) DEFAULT NULL COMMENT '路由路径',
  `component`   VARCHAR(128) DEFAULT NULL COMMENT '前端组件路径',
  `icon`        VARCHAR(64)  DEFAULT NULL,
  `permission`  VARCHAR(128) DEFAULT NULL COMMENT '权限标识: system:user:add',
  `sort`        INT          NOT NULL DEFAULT 0,
  `visible`     TINYINT      NOT NULL DEFAULT 1 COMMENT '1显示 0隐藏',
  `status`      TINYINT      NOT NULL DEFAULT 1 COMMENT '1启用 0禁用',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`  DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_menu_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='菜单与权限表';

-- 2.3 权限点表 (细粒度操作权限)
DROP TABLE IF EXISTS `permission`;
CREATE TABLE `permission` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(128) NOT NULL COMMENT '权限编码: knowledge:create',
  `name`        VARCHAR(64)  NOT NULL COMMENT '权限名称',
  `module`      VARCHAR(32)  NOT NULL COMMENT '所属模块: knowledge/document/user',
  `type`        TINYINT      NOT NULL DEFAULT 1 COMMENT '1菜单 2按钮 3接口',
  `description` VARCHAR(255) DEFAULT NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`  DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_perm_code` (`code`),
  KEY `idx_perm_module` (`module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权限点表';

-- 2.4 用户-角色关联表
DROP TABLE IF EXISTS `user_role`;
CREATE TABLE `user_role` (
  `user_id`     BIGINT NOT NULL,
  `role_id`     BIGINT NOT NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `role_id`),
  KEY `idx_ur_role` (`role_id`),
  CONSTRAINT `fk_ur_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ur_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户-角色关联';

-- 2.5 角色-权限关联表
DROP TABLE IF EXISTS `role_permission`;
CREATE TABLE `role_permission` (
  `role_id`       BIGINT NOT NULL,
  `permission_id` BIGINT NOT NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`, `permission_id`),
  KEY `idx_rp_perm` (`permission_id`),
  CONSTRAINT `fk_rp_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rp_perm` FOREIGN KEY (`permission_id`) REFERENCES `permission` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色-权限关联';

-- 2.6 角色-菜单关联表
DROP TABLE IF EXISTS `role_menu`;
CREATE TABLE `role_menu` (
  `role_id`    BIGINT NOT NULL,
  `menu_id`    BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`, `menu_id`),
  KEY `idx_rm_menu` (`menu_id`),
  CONSTRAINT `fk_rm_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rm_menu` FOREIGN KEY (`menu_id`) REFERENCES `menu` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色-菜单关联';


-- ============================================================
-- 3. 知识库模块
-- ============================================================

-- 3.1 知识库表
DROP TABLE IF EXISTS `knowledge`;
CREATE TABLE `knowledge` (
  `id`                  BIGINT       NOT NULL AUTO_INCREMENT,
  `name`                VARCHAR(128) NOT NULL COMMENT '知识库名称',
  `description`         TEXT         DEFAULT NULL,
  `icon`                VARCHAR(64)  DEFAULT NULL,
  `embedding_model_id`  BIGINT       DEFAULT NULL COMMENT 'FK system_config',
  `embedding_dimension` INT          NOT NULL DEFAULT 1024 COMMENT '向量维度, bge-m3=1024',
  `retrieval_config`    JSON         DEFAULT NULL COMMENT '检索参数: topK/rerank/score_threshold',
  `parse_policy`        JSON         DEFAULT NULL COMMENT '默认解析策略: mode/chunkSize/overlap/ocr',
  `tags_schema`         JSON         DEFAULT NULL COMMENT '标签定义',
  `cpu_quota`           INT          NOT NULL DEFAULT 0 COMMENT '限流配额, 0不限',
  `owner_id`            BIGINT       NOT NULL COMMENT 'FK user',
  `status`              TINYINT      NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
  `created_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`          DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_kb_owner` (`owner_id`),
  KEY `idx_kb_status` (`status`),
  CONSTRAINT `fk_kb_owner` FOREIGN KEY (`owner_id`) REFERENCES `user` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识库表';

-- 3.2 知识库成员表 (授权其他用户访问)
DROP TABLE IF EXISTS `knowledge_member`;
CREATE TABLE `knowledge_member` (
  `knowledge_id` BIGINT      NOT NULL,
  `user_id`      BIGINT      NOT NULL,
  `role`         VARCHAR(16) NOT NULL DEFAULT 'viewer' COMMENT 'owner/editor/viewer',
  `created_at`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`knowledge_id`, `user_id`),
  KEY `idx_km_user` (`user_id`),
  CONSTRAINT `fk_km_kb` FOREIGN KEY (`knowledge_id`) REFERENCES `knowledge` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_km_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识库成员授权';


-- ============================================================
-- 4. 文档模块
-- ============================================================

-- 4.1 文档表
DROP TABLE IF EXISTS `document`;
CREATE TABLE `document` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT,
  `knowledge_id`  BIGINT       NOT NULL,
  `file_name`     VARCHAR(255) NOT NULL,
  `file_size`     BIGINT       NOT NULL DEFAULT 0 COMMENT '字节',
  `mime_type`     VARCHAR(64)  NOT NULL,
  `object_key`    VARCHAR(512) NOT NULL COMMENT 'MinIO 存储key',
  `source`        VARCHAR(16)  NOT NULL DEFAULT 'local' COMMENT 'local(v2扩展tos/url)',
  `status`        VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT 'pending/parsing/embedding/ready/failed',
  `error_msg`     TEXT         DEFAULT NULL,
  `tags`          JSON         DEFAULT NULL,
  `metadata`      JSON         DEFAULT NULL COMMENT '结构化字段',
  `parse_policy`  JSON         DEFAULT NULL COMMENT '覆盖知识库默认策略',
  `chunk_count`   INT          NOT NULL DEFAULT 0,
  `token_count`   INT          NOT NULL DEFAULT 0,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`    DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_doc_kb` (`knowledge_id`),
  KEY `idx_doc_status` (`status`),
  CONSTRAINT `fk_doc_kb` FOREIGN KEY (`knowledge_id`) REFERENCES `knowledge` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文档表';

-- 4.2 文档切片表
DROP TABLE IF EXISTS `chunk`;
CREATE TABLE `chunk` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT,
  `document_id`   BIGINT       NOT NULL,
  `seq`           INT          NOT NULL DEFAULT 0 COMMENT '切片序号',
  `content`       MEDIUMTEXT   NOT NULL COMMENT '切片文本',
  `page`          INT          DEFAULT NULL COMMENT '所属页',
  `position`      JSON         DEFAULT NULL COMMENT '坐标',
  `images`        JSON         DEFAULT NULL COMMENT '图片附件key列表',
  `summary`       TEXT         DEFAULT NULL COMMENT 'AI摘要',
  `token_count`   INT          NOT NULL DEFAULT 0,
  `vector_id`     VARCHAR(64)  DEFAULT NULL COMMENT 'Qdrant中的点ID',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_chunk_doc` (`document_id`),
  KEY `idx_chunk_vector` (`vector_id`),
  CONSTRAINT `fk_chunk_doc` FOREIGN KEY (`document_id`) REFERENCES `document` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文档切片表';


-- ============================================================
-- 5. 问答会话模块
-- ============================================================

-- 5.1 会话表
DROP TABLE IF EXISTS `chat_session`;
CREATE TABLE `chat_session` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT,
  `user_id`      BIGINT       NOT NULL,
  `title`        VARCHAR(128) DEFAULT NULL COMMENT '会话标题(默认取首问)',
  `model`        VARCHAR(64)  DEFAULT NULL COMMENT '使用的LLM',
  `last_message_at` DATETIME  DEFAULT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`   DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_session_user` (`user_id`),
  CONSTRAINT `fk_session_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='问答会话表';

-- 5.2 消息表
DROP TABLE IF EXISTS `chat_message`;
CREATE TABLE `chat_message` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT,
  `session_id`   BIGINT       NOT NULL,
  `role`         VARCHAR(16)  NOT NULL COMMENT 'user/assistant/system',
  `content`      MEDIUMTEXT   NOT NULL,
  `model`        VARCHAR(64)  DEFAULT NULL,
  `knowledge_ids` JSON         DEFAULT NULL COMMENT '本次问答命中的知识库',
  `retrieval_info` JSON       DEFAULT NULL COMMENT '检索参数快照',
  `token_input`  INT          NOT NULL DEFAULT 0,
  `token_output` INT          NOT NULL DEFAULT 0,
  `latency_ms`   INT          NOT NULL DEFAULT 0 COMMENT '响应耗时',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_msg_session` (`session_id`),
  CONSTRAINT `fk_msg_session` FOREIGN KEY (`session_id`) REFERENCES `chat_session` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='问答消息表';

-- 5.3 引用关系表 (回答引用了哪些切片)
DROP TABLE IF EXISTS `chat_citation`;
CREATE TABLE `chat_citation` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT,
  `message_id`   BIGINT       NOT NULL,
  `chunk_id`     BIGINT       DEFAULT NULL,
  `document_id`  BIGINT       DEFAULT NULL,
  `doc_name`     VARCHAR(255) DEFAULT NULL COMMENT '冗余文档名',
  `page`         INT          DEFAULT NULL,
  `score`        DECIMAL(5,4) DEFAULT NULL COMMENT '相关度',
  `snippet`      TEXT         DEFAULT NULL COMMENT '引用片段',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cite_msg` (`message_id`),
  KEY `idx_cite_chunk` (`chunk_id`),
  CONSTRAINT `fk_cite_msg` FOREIGN KEY (`message_id`) REFERENCES `chat_message` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='问答引用关系表';


-- ============================================================
-- 6. 系统配置与审计
-- ============================================================

-- 6.1 系统配置表
DROP TABLE IF EXISTS `system_config`;
CREATE TABLE `system_config` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT,
  `key`         VARCHAR(64)  NOT NULL COMMENT '配置键',
  `value`       TEXT         NOT NULL COMMENT '配置值(敏感信息加密)',
  `category`    VARCHAR(32)  NOT NULL DEFAULT 'general' COMMENT 'model/vector/storage/notify/general',
  `is_secret`   TINYINT      NOT NULL DEFAULT 0,
  `description` VARCHAR(255) DEFAULT NULL,
  `updated_by`  BIGINT       DEFAULT NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_config_key` (`key`),
  KEY `idx_config_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统配置表';

-- 6.2 审计日志表
DROP TABLE IF EXISTS `audit_log`;
CREATE TABLE `audit_log` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT,
  `user_id`       BIGINT       DEFAULT NULL,
  `username`      VARCHAR(32)  DEFAULT NULL COMMENT '冗余用户名',
  `action`        VARCHAR(64)  NOT NULL COMMENT 'login/create/delete/export',
  `resource_type` VARCHAR(32) DEFAULT NULL COMMENT 'user/knowledge/document',
  `resource_id`   BIGINT       DEFAULT NULL,
  `ip`            VARCHAR(45)  DEFAULT NULL,
  `user_agent`    VARCHAR(255) DEFAULT NULL,
  `result`        VARCHAR(16)  NOT NULL DEFAULT 'success' COMMENT 'success/failed',
  `detail`        JSON         DEFAULT NULL COMMENT '变更详情',
  `latency_ms`    INT          DEFAULT NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_user` (`user_id`),
  KEY `idx_audit_action` (`action`),
  KEY `idx_audit_resource` (`resource_type`, `resource_id`),
  KEY `idx_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审计日志表';


SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 7. 初始化数据
-- ============================================================

-- 7.1 默认管理员账号
-- 用户名: admin
-- 密码:   admin123
-- (password_hash 为 admin123 的 bcrypt 加密, cost=10)
INSERT INTO `user` (`username`, `password_hash`, `nickname`, `role`, `status`) VALUES
  ('admin', '$2b$10$gNVFJqDvYOimJqoS3SHQJuowRYYkya61q0g7ubzxOzPTPTIt3TXee', '超级管理员', 'ADMIN', 1)
ON DUPLICATE KEY UPDATE `password_hash` = VALUES(`password_hash`);

-- 7.2 默认角色
INSERT INTO `role` (`code`, `name`, `description`, `sort`) VALUES
  ('admin', '管理员', '系统全权限', 1),
  ('user',  '知识库用户', '创建/管理自有知识库、上传文档、调用问答', 2)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- 7.3 用户-角色关联 (admin 用户绑定 admin 角色)
INSERT INTO `user_role` (`user_id`, `role_id`)
  SELECT u.id, r.id FROM `user` u, `role` r
  WHERE u.username = 'admin' AND r.code = 'admin'
ON DUPLICATE KEY UPDATE `user_id` = VALUES(`user_id`);

-- ============================================================
-- 完成
-- 表清单 (16 张):
--   user / role / menu / permission
--   user_role / role_permission / role_menu
--   knowledge / knowledge_member
--   document / chunk
--   chat_session / chat_message / chat_citation
--   system_config / audit_log
-- ============================================================
