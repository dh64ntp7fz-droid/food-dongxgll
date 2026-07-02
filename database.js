const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || '';

let pool;

async function initDb() {
  if (!DATABASE_URL) {
    console.log('[DB] ⚠️ 未设置 DATABASE_URL，使用 SQLite 回退');
    return initSqlite();
  }

  pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    // 测试连接
    await pool.query('SELECT 1');
    console.log('[DB] ✅ PostgreSQL 连接成功');

    // 建表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS regions (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        webhook_url TEXT NOT NULL DEFAULT '',
        sort_order INT NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS stores (
        id SERIAL PRIMARY KEY,
        region_id INT DEFAULT 0,
        name TEXT NOT NULL UNIQUE,
        active INT NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS dishes (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        active INT NOT NULL DEFAULT 1,
        dish_group TEXT NOT NULL DEFAULT '通用',
        sort_order INT NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY,
        store_id INT NOT NULL,
        region_id INT DEFAULT 0,
        store_name TEXT NOT NULL,
        date TEXT NOT NULL,
        items TEXT NOT NULL,
        submit_time TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_store_date ON submissions(store_id, date);
    `);
    console.log('[DB] ✅ 表结构就绪');

    // 种子数据：区域
    const { rowCount: rc } = await pool.query('SELECT COUNT(*) FROM regions');
    if (parseInt(rc) === 0) {
      await pool.query(`INSERT INTO regions (name, webhook_url, sort_order) VALUES
        ('袁东升','https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=44356646-0dda-484b-9a79-fa0ad45b8a50',0),
        ('夏志平','',1),('刘兆鹏','',2),('刘广','',3),('昌跃兵','',4),
        ('王杰','',5),('王海龙','',6),('罗爱民','',7),('贺剑','',8)
      ON CONFLICT (name) DO NOTHING`);
      console.log('[DB] ✅ 区域种子数据已插入');
    }

    // 种子数据：门店
    const { rowCount: sc } = await pool.query('SELECT COUNT(*) FROM stores');
    if (parseInt(sc) === 0) {
      await pool.query(`INSERT INTO stores (region_id, name, sort_order) VALUES
        (1,'绿岛花园店',0),(1,'石岩主场店',1),(1,'大朗犀牛坡店',2),(1,'横岗新世界店',3),
        (1,'松山湖绿荷居店',4),(1,'松山湖科苑店',5),(1,'大朗体育馆店',6)
      ON CONFLICT (name) DO NOTHING`);
      console.log('[DB] ✅ 门店种子数据已插入');
    }

    // 种子数据：菜品
    const { rowCount: dc } = await pool.query('SELECT COUNT(*) FROM dishes');
    if (parseInt(dc) === 0) {
      await pool.query(`INSERT INTO dishes (name, dish_group, sort_order) VALUES
        ('红烧肉','调改店',0),('糖醋排骨','非调改店',1),('清蒸鲈鱼','调改店',2),('宫保鸡丁','通用',3),
        ('麻婆豆腐','非调改店',4),('回锅肉','调改店',5),('水煮鱼','非调改店',6),('干煸四季豆','通用',7),
        ('鱼香肉丝','调改店',8),('西红柿炒蛋','通用',9),('酸辣土豆丝','非调改店',10),('蒜蓉西兰花','调改店',11),
        ('红烧茄子','非调改店',12),('京酱肉丝','调改店',13),('锅包肉','通用',14)
      ON CONFLICT (name) DO NOTHING`);
      console.log('[DB] ✅ 菜品种子数据已插入');
    }

    console.log('[DB] ✅ 数据库初始化完成');
  } catch (e) {
    console.error('[DB] ❌ PostgreSQL 初始化失败:', e.message);
    console.log('[DB] ⚠️ 使用 SQLite 回退');
    return initSqlite();
  }
}

async function initSqlite() {
  // 回退到 SQLite（原来逻辑）
  const Database = require('better-sqlite3');
  const path = require('path');
  const fs = require('fs');
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'food-waste.db');
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS regions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, webhook_url TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS stores (id INTEGER PRIMARY KEY AUTOINCREMENT, region_id INTEGER DEFAULT 0, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS dishes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, dish_group TEXT NOT NULL DEFAULT '通用', sort_order INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER NOT NULL, region_id INTEGER DEFAULT 0, store_name TEXT NOT NULL, date TEXT NOT NULL, items TEXT NOT NULL, submit_time TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_store_date ON submissions(store_id, date);
  `);

  const sCols = db.prepare("PRAGMA table_info(stores)").all().map(c => c.name);
  if (!sCols.includes('region_id')) db.exec("ALTER TABLE stores ADD COLUMN region_id INTEGER DEFAULT 0");
  const dCols = db.prepare("PRAGMA table_info(dishes)").all().map(c => c.name);
  if (!dCols.includes('dish_group')) db.exec("ALTER TABLE dishes ADD COLUMN dish_group TEXT NOT NULL DEFAULT '通用'");

  const rc = db.prepare('SELECT COUNT(*) as cnt FROM regions').get().cnt;
  if (rc === 0) {
    db.transaction(() => {
      ['袁东升','夏志平','刘兆鹏','刘广','昌跃兵','王杰','王海龙','罗爱民','贺剑'].forEach((n, i) => {
        db.prepare('INSERT INTO regions (name, webhook_url, sort_order) VALUES (?, ?, ?)').run(n, i === 0 ? 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=44356646-0dda-484b-9a79-fa0ad45b8a50' : '', i);
      });
    })();
  }
  const sc = db.prepare('SELECT COUNT(*) as cnt FROM stores').get().cnt;
  if (sc === 0) {
    db.transaction(() => {
      ['绿岛花园店','石岩主场店','大朗犀牛坡店','横岗新世界店','松山湖绿荷居店','松山湖科苑店','大朗体育馆店'].forEach((s, i) => {
        db.prepare('INSERT INTO stores (region_id, name, sort_order) VALUES (?, ?, ?)').run(1, s, i);
      });
    })();
  }
  const dc = db.prepare('SELECT COUNT(*) as cnt FROM dishes').get().cnt;
  if (dc === 0) {
    db.transaction(() => {
      [['红烧肉','调改店'],['糖醋排骨','非调改店'],['清蒸鲈鱼','调改店'],['宫保鸡丁','通用'],['麻婆豆腐','非调改店'],['回锅肉','调改店'],['水煮鱼','非调改店'],['干煸四季豆','通用'],['鱼香肉丝','调改店'],['西红柿炒蛋','通用'],['酸辣土豆丝','非调改店'],['蒜蓉西兰花','调改店'],['红烧茄子','非调改店'],['京酱肉丝','调改店'],['锅包肉','通用']].forEach((d, i) => db.prepare('INSERT INTO dishes (name, dish_group, sort_order) VALUES (?, ?, ?)').run(d[0], d[1], i));
    })();
  }
  console.log(`[DB] SQLite 就绪 ${DB_PATH}`);
}

// ===================== Regions =====================

async function q(text, params) {
  if (pool) {
    const r = await pool.query(text, params);
    return r.rows;
  }
  throw new Error('数据库未连接');
}

function qs(text, params) {
  if (pool) return q(text, params);
  throw new Error('数据库未连接');
}

async function getAllRegions() {
  const r = await q('SELECT * FROM regions ORDER BY sort_order');
  return r;
}

async function addRegion(name, webhookUrl) {
  const { rows } = await pool.query("SELECT COALESCE(MAX(sort_order),0) + 1 as m FROM regions");
  const s = rows[0].m;
  await q('INSERT INTO regions (name, webhook_url, sort_order) VALUES ($1, $2, $3)', [name, webhookUrl || '', s]);
  return { lastInsertRowid: s };
}

async function updateRegion(id, name, webhookUrl) {
  await q('UPDATE regions SET name = $1, webhook_url = $2 WHERE id = $3', [name, webhookUrl || '', id]);
}

async function deleteRegion(id) {
  await q('DELETE FROM regions WHERE id = $1', [id]);
}

// ===================== Stores =====================

async function getActiveStores() {
  return await q('SELECT id, name, region_id FROM stores WHERE active = 1 ORDER BY sort_order');
}

async function getActiveStoresByRegion(regionId) {
  return await q('SELECT id, name FROM stores WHERE active = 1 AND region_id = $1 ORDER BY sort_order', [regionId]);
}

async function getAllStores() {
  return await q('SELECT s.*, r.name as region_name FROM stores s LEFT JOIN regions r ON s.region_id = r.id ORDER BY s.sort_order');
}

async function addStore(name, regionId) {
  const { rows } = await pool.query("SELECT COALESCE(MAX(sort_order),0) + 1 as m FROM stores");
  await q('INSERT INTO stores (region_id, name, sort_order) VALUES ($1, $2, $3)', [regionId || 0, name, rows[0].m]);
  return { lastInsertRowid: rows[0].m };
}

async function updateStore(id, name) {
  await q('UPDATE stores SET name = $1 WHERE id = $2', [name, id]);
}

async function toggleStore(id) {
  await q('UPDATE stores SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = $1', [id]);
}

async function deleteStore(id) {
  await q('DELETE FROM stores WHERE id = $1', [id]);
}

// ===================== Dishes =====================

async function getActiveDishes() {
  return await q('SELECT id, name, dish_group FROM dishes WHERE active = 1 ORDER BY sort_order');
}

async function getAllDishes() {
  return await q('SELECT * FROM dishes ORDER BY sort_order');
}

async function addDish(name, dishGroup) {
  const { rows } = await pool.query("SELECT COALESCE(MAX(sort_order),0) + 1 as m FROM dishes");
  await q('INSERT INTO dishes (name, dish_group, sort_order) VALUES ($1, $2, $3)', [name, dishGroup || '通用', rows[0].m]);
  return { lastInsertRowid: rows[0].m };
}

async function updateDish(id, name, dishGroup) {
  if (dishGroup !== undefined) {
    await q('UPDATE dishes SET name = $1, dish_group = $2 WHERE id = $3', [name, dishGroup, id]);
  } else {
    await q('UPDATE dishes SET name = $1 WHERE id = $2', [name, id]);
  }
}

async function toggleDish(id) {
  await q('UPDATE dishes SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = $1', [id]);
}

async function deleteDish(id) {
  await q('DELETE FROM dishes WHERE id = $1', [id]);
}

// ===================== Submissions =====================

async function submitReport(storeId, regionId, storeName, date, items, submitTime) {
  // 先删除旧的（同门店同天）
  await q('DELETE FROM submissions WHERE store_id = $1 AND date = $2', [storeId, date]);
  await q('INSERT INTO submissions (store_id, region_id, store_name, date, items, submit_time) VALUES ($1, $2, $3, $4, $5, $6)',
    [storeId, regionId || 0, storeName, date, items, submitTime]);
}

async function getSubmission(storeId, date) {
  const r = await q('SELECT * FROM submissions WHERE store_id = $1 AND date = $2', [storeId, date]);
  return r[0] || null;
}

async function getTodaySubmissions(date) {
  return await q('SELECT * FROM submissions WHERE date = $1', [date]);
}

async function getTodaySubmissionsByRegion(date, regionId) {
  return await q('SELECT * FROM submissions WHERE date = $1 AND region_id = $2', [date, regionId]);
}

async function getTodaySummary(date) {
  const [submitted, allActive] = await Promise.all([getTodaySubmissions(date), getActiveStores()]);
  const submittedIds = new Set(submitted.map(s => s.store_id));
  const notSubmitted = allActive.filter(s => !submittedIds.has(s.id));
  return { submitted, notSubmitted, allStores: allActive };
}

async function getTodaySummaryByRegion(date, regionId) {
  const [submitted, allActive] = await Promise.all([getTodaySubmissionsByRegion(date, regionId), getActiveStoresByRegion(regionId)]);
  const submittedIds = new Set(submitted.map(s => s.store_id));
  const notSubmitted = allActive.filter(s => !submittedIds.has(s.id));
  return { submitted, notSubmitted, allStores: allActive };
}

module.exports = {
  initDb,
  getAllRegions, addRegion, updateRegion, deleteRegion,
  getActiveStores, getActiveStoresByRegion, getAllStores,
  addStore, updateStore, toggleStore, deleteStore,
  getActiveDishes, getAllDishes,
  addDish, updateDish, toggleDish, deleteDish,
  submitReport, getSubmission, getTodaySubmissions, getTodaySummary,
  getTodaySummaryByRegion,
};
