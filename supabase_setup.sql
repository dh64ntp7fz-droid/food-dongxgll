-- 不能隔夜菜品上报系统 · Supabase 建表脚本
-- 在 Supabase Dashboard → SQL Editor 运行

-- 区域表
CREATE TABLE IF NOT EXISTS regions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  webhook_url TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0
);

-- 门店表
CREATE TABLE IF NOT EXISTS stores (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  region_id INT DEFAULT 0,
  name TEXT NOT NULL UNIQUE,
  active INT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0
);

-- 菜品表
CREATE TABLE IF NOT EXISTS dishes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active INT NOT NULL DEFAULT 1,
  dish_group TEXT NOT NULL DEFAULT '通用',
  sort_order INT NOT NULL DEFAULT 0
);

-- 提交记录表
CREATE TABLE IF NOT EXISTS submissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id INT NOT NULL,
  region_id INT DEFAULT 0,
  store_name TEXT NOT NULL,
  date TEXT NOT NULL,
  items TEXT NOT NULL,
  submit_time TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_store_date ON submissions(store_id, date);

-- 种子数据：区域
INSERT INTO regions (name, webhook_url, sort_order) VALUES
  ('袁东升', 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=44356646-0dda-484b-9a79-fa0ad45b8a50', 0),
  ('夏志平', '', 1),
  ('刘兆鹏', '', 2),
  ('刘广', '', 3),
  ('昌跃兵', '', 4),
  ('王杰', '', 5),
  ('王海龙', '', 6),
  ('罗爱民', '', 7),
  ('贺剑', '', 8)
ON CONFLICT (name) DO NOTHING;

-- 种子数据：门店（袁东升区域 id=1）
INSERT INTO stores (region_id, name, active, sort_order) VALUES
  (1, '绿岛花园店', 1, 0),
  (1, '石岩主场店', 1, 1),
  (1, '大朗犀牛坡店', 1, 2),
  (1, '横岗新世界店', 1, 3),
  (1, '松山湖绿荷居店', 1, 4),
  (1, '松山湖科苑店', 1, 5),
  (1, '大朗体育馆店', 1, 6)
ON CONFLICT (name) DO NOTHING;

-- 种子数据：菜品（带分组）
INSERT INTO dishes (name, dish_group, active, sort_order) VALUES
  ('红烧肉', '调改店', 1, 0),
  ('糖醋排骨', '非调改店', 1, 1),
  ('清蒸鲈鱼', '调改店', 1, 2),
  ('宫保鸡丁', '通用', 1, 3),
  ('麻婆豆腐', '非调改店', 1, 4),
  ('回锅肉', '调改店', 1, 5),
  ('水煮鱼', '非调改店', 1, 6),
  ('干煸四季豆', '通用', 1, 7),
  ('鱼香肉丝', '调改店', 1, 8),
  ('西红柿炒蛋', '通用', 1, 9),
  ('酸辣土豆丝', '非调改店', 1, 10),
  ('蒜蓉西兰花', '调改店', 1, 11),
  ('红烧茄子', '非调改店', 1, 12),
  ('京酱肉丝', '调改店', 1, 13),
  ('锅包肉', '通用', 1, 14)
ON CONFLICT (name) DO NOTHING;
