// ===================== 双数据库层（PostgreSQL / SQLite 回退） =====================

const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

let pgPool = null;   // PostgreSQL 连接池
let sqDb = null;     // SQLite 数据库实例
let isPg = false;    // 是否使用 PostgreSQL

// ── 初始化 ──

async function initDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { initSqlite(); return; }

  // 尝试 PostgreSQL
  pgPool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  try {
    await pgPool.query('SELECT 1');
    console.log('[DB] ✅ PostgreSQL 连接成功');
    await createPgTables();
    await seedPgData();
    isPg = true;
    console.log('[DB] ✅ 数据库就绪');
  } catch (e) {
    console.error('[DB] ❌ PostgreSQL 失败:', e.message);
    pgPool = null;
    initSqlite();
  }
}

// ── PostgreSQL 建表 ──

async function createPgTables() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS regions (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, webhook_url TEXT NOT NULL DEFAULT '', sort_order INT NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS stores (id SERIAL PRIMARY KEY, region_id INT DEFAULT 0, name TEXT NOT NULL UNIQUE, active BOOLEAN NOT NULL DEFAULT TRUE, sort_order INT NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS dishes (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, active BOOLEAN NOT NULL DEFAULT TRUE, dish_group TEXT NOT NULL DEFAULT '通用', sort_order INT NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS submissions (id SERIAL PRIMARY KEY, store_id INT NOT NULL, region_id INT DEFAULT 0, store_name TEXT NOT NULL, date TEXT NOT NULL, items TEXT NOT NULL, submit_time TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_store_date ON submissions(store_id, date);
  `);
}

async function seedPgData() {
  const { rows: rc } = await pgPool.query("SELECT COUNT(*) as c FROM regions");
  if (parseInt(rc[0].c) === 0) {
    await pgPool.query(`INSERT INTO regions (name, webhook_url, sort_order) VALUES
      ('袁东升','https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=44356646-0dda-484b-9a79-fa0ad45b8a50',0),
      ('夏志平','',1),('刘兆鹏','',2),('刘广','',3),('昌跃兵','',4),
      ('王杰','',5),('王海龙','',6),('罗爱民','',7),('贺剑','',8)
    ON CONFLICT (name) DO NOTHING`);
  }
  const { rows: sc } = await pgPool.query("SELECT COUNT(*) as c FROM dishes");
  if (parseInt(sc[0].c) === 0) {
    await pgPool.query(`INSERT INTO dishes (name, dish_group, sort_order) VALUES
      ('红烧肉','调改店',0),('糖醋排骨','非调改店',1),('清蒸鲈鱼','调改店',2),('宫保鸡丁','通用',3),
      ('麻婆豆腐','非调改店',4),('回锅肉','调改店',5),('水煮鱼','非调改店',6),('干煸四季豆','通用',7),
      ('鱼香肉丝','调改店',8),('西红柿炒蛋','通用',9),('酸辣土豆丝','非调改店',10),('蒜蓉西兰花','调改店',11),
      ('红烧茄子','非调改店',12),('京酱肉丝','调改店',13),('锅包肉','通用',14)
    ON CONFLICT (name) DO NOTHING`);
  }
}

// ── SQLite 初始化（回退方案） ──

function initSqlite() {
  const Database = require('better-sqlite3');
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'food-waste.db');
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  sqDb = new Database(DB_PATH);
  sqDb.pragma('journal_mode = WAL');

  sqDb.exec(`
    CREATE TABLE IF NOT EXISTS regions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, webhook_url TEXT DEFAULT '', sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS stores (id INTEGER PRIMARY KEY AUTOINCREMENT, region_id INTEGER DEFAULT 0, name TEXT UNIQUE, active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS dishes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, active INTEGER DEFAULT 1, dish_group TEXT DEFAULT '通用', sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER, region_id INTEGER DEFAULT 0, store_name TEXT, date TEXT, items TEXT, submit_time TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_store_date ON submissions(store_id, date);
  `);

  // 兼容旧列
  const sCols = sqDb.prepare("PRAGMA table_info(stores)").all().map(c => c.name);
  if (!sCols.includes('region_id')) sqDb.exec("ALTER TABLE stores ADD COLUMN region_id INTEGER DEFAULT 0");
  if (!sCols.includes('active')) sqDb.exec("ALTER TABLE stores ADD COLUMN active INTEGER DEFAULT 1");
  if (!sCols.includes('sort_order')) sqDb.exec("ALTER TABLE stores ADD COLUMN sort_order INTEGER DEFAULT 0");
  const dCols = sqDb.prepare("PRAGMA table_info(dishes)").all().map(c => c.name);
  if (!dCols.includes('dish_group')) sqDb.exec("ALTER TABLE dishes ADD COLUMN dish_group TEXT DEFAULT '通用'");

  // 种子数据
  if (sqDb.prepare('SELECT COUNT(*) as c FROM regions').get().c === 0) {
    sqDb.transaction(() => {
      ['袁东升','夏志平','刘兆鹏','刘广','昌跃兵','王杰','王海龙','罗爱民','贺剑'].forEach((n, i) =>
        sqDb.prepare('INSERT INTO regions (name, webhook_url, sort_order) VALUES (?,?,?)').run(n, i === 0 ? 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=44356646-0dda-484b-9a79-fa0ad45b8a50' : '', i));
    })();
  }
  if (sqDb.prepare('SELECT COUNT(*) as c FROM stores').get().c === 0) {
    sqDb.transaction(() => {
      ['绿岛花园店','石岩主场店','大朗犀牛坡店','横岗新世界店','松山湖绿荷居店','松山湖科苑店','大朗体育馆店'].forEach((s, i) => sqDb.prepare('INSERT INTO stores (region_id, name, sort_order) VALUES (?,?,?)').run(1, s, i));
    })();
  }
  if (sqDb.prepare('SELECT COUNT(*) as c FROM dishes').get().c === 0) {
    sqDb.transaction(() => {
      [['红烧肉','调改店'],['糖醋排骨','非调改店'],['清蒸鲈鱼','调改店'],['宫保鸡丁','通用'],['麻婆豆腐','非调改店'],['回锅肉','调改店'],['水煮鱼','非调改店'],['干煸四季豆','通用'],['鱼香肉丝','调改店'],['西红柿炒蛋','通用'],['酸辣土豆丝','非调改店'],['蒜蓉西兰花','调改店'],['红烧茄子','非调改店'],['京酱肉丝','调改店'],['锅包肉','通用']].forEach((d, i) => sqDb.prepare('INSERT INTO dishes (name, dish_group, sort_order) VALUES (?,?,?)').run(d[0], d[1], i));
    })();
  }
  isPg = false;
  console.log(`[DB] SQLite 就绪 ${DB_PATH}`);
}

// ===================== 统一查询接口 =====================

// PostgreSQL
async function pg(text, params) {
  const r = await pgPool.query(text, params);
  return r.rows;
}

// SQLite 同步包装为异步
function sq(text, params) {
  if (params) {
    const stmt = sqDb.prepare(text);
    if (text.trim().toUpperCase().startsWith('SELECT') || text.trim().toUpperCase().startsWith('WITH') || text.includes('RETURNING'))
      return stmt.all(...params);
    stmt.run(...params);
    return [];
  }
  if (text.trim().toUpperCase().startsWith('SELECT') || text.includes('RETURNING')) return sqDb.prepare(text).all();
  sqDb.prepare(text).run();
  return [];
}

function q(text, params) {
  if (isPg) return pg(text, params);
  return Promise.resolve(sq(text, params));
}

// ===================== Regions =====================

async function getAllRegions() { return await q('SELECT * FROM regions ORDER BY sort_order'); }
async function addRegion(name, webhookUrl) {
  if (isPg) {
    await q('INSERT INTO regions (name, webhook_url, sort_order) VALUES ($1,$2,COALESCE((SELECT MAX(sort_order)+1 FROM regions),0))', [name, webhookUrl || '']);
  } else {
    const max = q('SELECT COALESCE(MAX(sort_order),0)+1 as m FROM regions')[0].m;
    q('INSERT INTO regions (name, webhook_url, sort_order) VALUES (?,?,?)', [name, webhookUrl || '', max]);
  }
}
async function updateRegion(id, name, webhookUrl) { await q('UPDATE regions SET name=$1, webhook_url=$2 WHERE id=$3', [name, webhookUrl || '', id]); }
async function deleteRegion(id) { await q('DELETE FROM regions WHERE id=$1', [id]); }

// ===================== Stores =====================

async function getActiveStores() { return await q('SELECT id,name,region_id FROM stores WHERE active=1 ORDER BY sort_order'); }
async function getActiveStoresByRegion(rid) { return await q('SELECT id,name FROM stores WHERE active=1 AND region_id=$1 ORDER BY sort_order', [rid]); }
async function getAllStores() { return await q('SELECT s.*, r.name as region_name FROM stores s LEFT JOIN regions r ON s.region_id=r.id ORDER BY s.sort_order'); }
async function addStore(name, regionId) {
  if (isPg) {
    await q('INSERT INTO stores (region_id,name,sort_order) VALUES ($1,$2,COALESCE((SELECT MAX(sort_order)+1 FROM stores),0))', [regionId || 0, name]);
  } else {
    const max = q('SELECT COALESCE(MAX(sort_order),0)+1 as m FROM stores')[0].m;
    q('INSERT INTO stores (region_id, name, sort_order) VALUES (?,?,?)', [regionId || 0, name, max]);
  }
}
async function updateStore(id, name) { await q('UPDATE stores SET name=$1 WHERE id=$2', [name, id]); }
async function toggleStore(id) {
  const s = await q('SELECT active FROM stores WHERE id=$1', [id]);
  const v = isPg ? (s[0]?.active ? false : true) : (s[0]?.active ? 0 : 1);
  await q('UPDATE stores SET active=$1 WHERE id=$2', [v, id]);
}
async function deleteStore(id) { await q('DELETE FROM stores WHERE id=$1', [id]); }

// ===================== Dishes =====================

async function getActiveDishes() { return await q('SELECT id,name,dish_group FROM dishes WHERE active=1 ORDER BY sort_order'); }
async function getAllDishes() { return await q('SELECT * FROM dishes ORDER BY sort_order'); }
async function addDish(name, dishGroup) {
  if (isPg) {
    await q('INSERT INTO dishes (name,dish_group,sort_order) VALUES ($1,$2,COALESCE((SELECT MAX(sort_order)+1 FROM dishes),0))', [name, dishGroup || '通用']);
  } else {
    const max = q('SELECT COALESCE(MAX(sort_order),0)+1 as m FROM dishes')[0].m;
    q('INSERT INTO dishes (name, dish_group, sort_order) VALUES (?,?,?)', [name, dishGroup || '通用', max]);
  }
}
async function updateDish(id, name, dishGroup) {
  dishGroup ? await q('UPDATE dishes SET name=$1,dish_group=$2 WHERE id=$3', [name, dishGroup, id]) : await q('UPDATE dishes SET name=$1 WHERE id=$2', [name, id]);
}
async function toggleDish(id) {
  const d = await q('SELECT active FROM dishes WHERE id=$1', [id]);
  const v = isPg ? (d[0]?.active ? false : true) : (d[0]?.active ? 0 : 1);
  await q('UPDATE dishes SET active=$1 WHERE id=$2', [v, id]);
}
async function deleteDish(id) { await q('DELETE FROM dishes WHERE id=$1', [id]); }

// ===================== Submissions =====================

async function submitReport(storeId, regionId, storeName, date, items, submitTime) {
  await q('DELETE FROM submissions WHERE store_id=$1 AND date=$2', [storeId, date]);
  await q('INSERT INTO submissions (store_id,region_id,store_name,date,items,submit_time) VALUES ($1,$2,$3,$4,$5,$6)', [storeId, regionId || 0, storeName, date, items, submitTime]);
}
async function getSubmission(storeId, date) { const r = await q('SELECT * FROM submissions WHERE store_id=$1 AND date=$2', [storeId, date]); return r[0] || null; }
async function getTodaySubmissions(date) { return await q('SELECT * FROM submissions WHERE date=$1', [date]); }
async function getTodaySubmissionsByRegion(date, rid) { return await q('SELECT * FROM submissions WHERE date=$1 AND region_id=$2', [date, rid]); }
async function getTodaySummary(date) {
  const [submitted, allActive] = await Promise.all([getTodaySubmissions(date), getActiveStores()]);
  const ids = new Set(submitted.map(s => s.store_id));
  return { submitted, notSubmitted: allActive.filter(s => !ids.has(s.id)), allStores: allActive };
}
async function getTodaySummaryByRegion(date, rid) {
  const [submitted, allActive] = await Promise.all([getTodaySubmissionsByRegion(date, rid), getActiveStoresByRegion(rid)]);
  const ids = new Set(submitted.map(s => s.store_id));
  return { submitted, notSubmitted: allActive.filter(s => !ids.has(s.id)), allStores: allActive };
}

module.exports = {
  initDb, getAllRegions, addRegion, updateRegion, deleteRegion,
  getActiveStores, getActiveStoresByRegion, getAllStores, addStore, updateStore, toggleStore, deleteStore,
  getActiveDishes, getAllDishes, addDish, updateDish, toggleDish, deleteDish,
  submitReport, getSubmission, getTodaySubmissions, getTodaySummary, getTodaySummaryByRegion,
};
