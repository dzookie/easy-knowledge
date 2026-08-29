-- 迁移: user.role ENUM → user.role_id BIGINT 外键关联 role 表

-- 1. 添加 role_id 字段(先加, 后填数据, 再删旧字段)
ALTER TABLE `user` ADD COLUMN `role_id` BIGINT NULL AFTER `role`;

-- 2. 根据 user.role 的值填充 role_id (ADMIN → role where code='admin', USER → role where code='user')
UPDATE `user` u SET `role_id` = (SELECT id FROM `role` WHERE code = LOWER(u.role));

-- 3. 删除旧索引(如果存在) + 旧字段
ALTER TABLE `user` DROP INDEX `idx_user_role`;
ALTER TABLE `user` DROP COLUMN `role`;

-- 4. role_id 设为 NOT NULL
ALTER TABLE `user` MODIFY `role_id` BIGINT NOT NULL;

-- 5. 添加索引 + 外键
ALTER TABLE `user` ADD INDEX `idx_user_role_id` (`role_id`);
ALTER TABLE `user` ADD CONSTRAINT `fk_user_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- 6. 验证
SELECT u.id, u.username, u.role_id, r.code, r.name FROM `user` u JOIN `role` r ON u.role_id = r.id;
