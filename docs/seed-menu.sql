-- 种子: 菜单数据 + 角色菜单关联
-- 先插入菜单(目录 type=1, 菜单 type=2), 再给 admin 角色关联所有菜单

-- 1. 插入菜单数据(清空后重建, 避免重复)
DELETE FROM `role_menu` WHERE 1=1;
DELETE FROM `menu` WHERE 1=1;

-- 目录: 概览
INSERT INTO `menu` (`id`, `parent_id`, `name`, `type`, `path`, `icon`, `sort`, `visible`, `status`) VALUES
(1, 0, '概览', 1, NULL, NULL, 0, 1, 1);

-- 菜单: 主控台
INSERT INTO `menu` (`id`, `parent_id`, `name`, `type`, `path`, `icon`, `sort`, `visible`, `status`) VALUES
(2, 1, '主控台', 2, '/admin/dashboard', 'Odometer', 1, 1, 1);

-- 目录: 知识库
INSERT INTO `menu` (`id`, `parent_id`, `name`, `type`, `path`, `icon`, `sort`, `visible`, `status`) VALUES
(3, 0, '知识库', 1, NULL, NULL, 2, 1, 1);

-- 菜单: 知识库管理
INSERT INTO `menu` (`id`, `parent_id`, `name`, `type`, `path`, `icon`, `sort`, `visible`, `status`) VALUES
(4, 3, '知识库管理', 2, '/admin/knowledge', 'Collection', 3, 1, 1);

-- 目录: 系统
INSERT INTO `menu` (`id`, `parent_id`, `name`, `type`, `path`, `icon`, `sort`, `visible`, `status`) VALUES
(5, 0, '系统', 1, NULL, NULL, 4, 1, 1);

-- 菜单: 用户管理 / 角色管理 / 角色权限 / 菜单管理
INSERT INTO `menu` (`id`, `parent_id`, `name`, `type`, `path`, `icon`, `sort`, `visible`, `status`) VALUES
(6, 5, '用户管理', 2, '/admin/user', 'User', 5, 1, 1),
(7, 5, '角色管理', 2, '/admin/role', 'Avatar', 6, 1, 1),
(8, 5, '角色权限', 2, '/admin/permission', 'Lock', 7, 1, 1),
(9, 5, '菜单管理', 2, '/admin/menu', 'Menu', 8, 1, 1);

-- 2. 给 admin 角色(id=1)关联所有菜单(id 1~9)
INSERT INTO `role_menu` (`role_id`, `menu_id`) VALUES
(1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7), (1, 8), (1, 9);

-- 3. 给 user 角色(id=2)关联: 概览 + 主控台 + 知识库 + 知识库管理(知识库用户只能看自己的)
INSERT INTO `role_menu` (`role_id`, `menu_id`) VALUES
(2, 1), (2, 2), (2, 3), (2, 4);

-- 4. 验证
SELECT m.id, m.parent_id, m.name, m.type, m.path, m.icon, m.sort FROM `menu` m ORDER BY m.sort;
SELECT rm.role_id, r.code, rm.menu_id, m.name FROM `role_menu` rm JOIN `role` r ON rm.role_id = r.id JOIN `menu` m ON rm.menu_id = m.id ORDER BY rm.role_id, rm.menu_id;
