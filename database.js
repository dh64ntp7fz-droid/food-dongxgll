// ===================== PostgreSQL 数据库层 =====================
// 支持自动建表，部署永不丢失
// 配好 DATABASE_URL 环境变量即可使用
// 也支持 SQLite 回退（不配 DATABASE_URL 时）

const { Pool } = require('pg');

// ── 连接 ──
let pool = null;

async function initDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return initSqlite();

  pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  try {
    await pool.query('SELECT 1');
    console.log('[DB] ✅ PostgreSQL 连接成功');

    // ── 自动建表 ──
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
        active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INT NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS dishes (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
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
    console.log('[DB] ✅ 表结构已就绪');

    // ── 种子数据（仅空表时写入） ──
    const { rows: rc } = await pool.query("SELECT COUNT(*) as c FROM regions");
    if (parseInt(rc[0].c) === 0) {
      await pool.query(`INSERT INTO regions (name, webhook_url, sort_order) VALUES
        ('袁东升','https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=44356646-0dda-484b-9a79-fa0ad45b8a50',0),
        ('夏志平','',1),('刘兆鹏','',2),('刘广','',3),('昌跃兵','',4),
        ('王杰','',5),('王海龙','',6),('罗爱民','',7),('贺剑','',8)
      ON CONFLICT (name) DO NOTHING`);
      console.log('[DB] ✅ 区域种子数据');
    }

    const { rows: sc } = await pool.query("SELECT COUNT(*) as c FROM stores");
    if (parseInt(sc[0].c) === 0) {
      await pool.query(`INSERT INTO stores (region_id, name, sort_order) VALUES
        (1,'绿岛花园店',0),(1,'石岩主场店',1),(1,'大朗犀牛坡店',2),(1,'横岗新世界店',3),
        (1,'松山湖绿荷居店',4),(1,'松山湖科苑店',5),(1,'大朗体育馆店',6)
      ON CONFLICT (name) DO NOTHING`);
      console.log('[DB] ✅ 门店种子数据');
    }

    const { rows: dc } = await pool.query("SELECT COUNT(*) as c FROM dishes");
    if (parseInt(dc[0].c) === 0) {
      await pool.query(`INSERT INTO dishes (name, dish_group, sort_order) VALUES
        ('红烧肉','调改店',0),('糖醋排骨','非调改店',1),('清蒸鲈鱼','调改店',2),('宫保鸡丁','通用',3),
        ('麻婆豆腐','非调改店',4),('回锅肉','调改店',5),('水煮鱼','非调改店',6),('干煸四季豆','通用',7),
        ('鱼香肉丝','调改店',8),('西红柿炒蛋','通用',9),('酸辣土豆丝','非调改店',10),('蒜蓉西兰花','调改店',11),
        ('红烧茄子','非调改店',12),('京酱肉丝','调改店',13),('锅包肉','通用',14)
      ON CONFLICT (name) DO NOTHING`);
      console.log('[DB] ✅ 菜品种子数据');
    }

    console.log('[DB] ✅ 数据库初始化完成');
    return;
  } catch (e) {
    console.error('[DB] ❌ PostgreSQL 连接失败:', e.message);
    console.log('[DB] ⚠️ 回退到 SQLite');
    pool = null;
    return initSqlite();
  }
}

// ── SQLite 回退（不配 DATABASE_URL 时使用） ──
const path = require('path');
const fs = require('fs');

function initSqlite() {
  const Database = require('better-sqlite3');
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'food-waste.db');
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS regions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, webhook_url TEXT DEFAULT '', sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS stores (id INTEGER PRIMARY KEY AUTOINCREMENT, region_id INTEGER DEFAULT 0, name TEXT UNIQUE, active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS dishes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, active INTEGER DEFAULT 1, dish_group TEXT DEFAULT '通用', sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER, region_id INTEGER DEFAULT 0, store_name TEXT, date TEXT, items TEXT, submit_time TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_store_date ON submissions(store_id, date);
  `);

  ['region_id', 'active'].forEach(c => {
    if (!db.prepare("PRAGMA table_info(stores)").all().map(x => x.name).includes(c))
      db.exec(`ALTER TABLE stores ADD COLUMN ${c} ${c === 'active' ? 'INTEGER DEFAULT 1' : 'INTEGER DEFAULT 0'}`);
  });
  ['dish_group'].forEach(c => {
    if (!db.prepare("PRAGMA table_info(dishes)").all().map(x => x.name).includes(c))
      db.exec(`ALTER TABLE dishes ADD COLUMN dish_group TEXT DEFAULT '通用'`);
  });

  if (db.prepare('SELECT COUNT(*) as c FROM regions').get().c === 0) {
    db.transaction(() => {
      ['袁东升','夏志平','刘兆鹏','刘广','昌跃兵','王杰','王海龙','罗爱民','贺剑'].forEach((n, i) =>
        db.prepare('INSERT INTO regions (name, webhook_url, sort_order) VALUES (?,?,?)').run(n, i === 0 ? 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=44356646-0dda-484b-9a79-fa0ad45b8a50' : '', i));
    })();
  }
  if (db.prepare('SELECT COUNT(*) as c FROM stores').get().c === 0) {
    db.transaction(() => {
      ['绿岛花园店','石岩主场店','大朗犀牛坡店','横岗新世界店','松山湖绿荷居店','松山湖科苑店','大朗体育馆店'].forEach((s, i) => db.prepare('INSERT INTO stores (region_id, name, sort_order) VALUES (?,?,?)').run(1, s, i));
    })();
  }
  if (db.prepare('SELECT COUNT(*) as c FROM dishes').get().c === 0) {
    db.transaction(() => {
      [['红烧肉','调改店'],['糖醋排骨','非调改店'],['清蒸鲈鱼','调改店'],['宫保鸡丁','通用'],['麻婆豆腐','非调改店'],['回锅肉','调改店'],['水煮鱼','非调改店'],['干煸四季豆','通用'],['鱼香肉丝','调改店'],['西红柿炒蛋','通用'],['酸辣土豆丝','非调改店'],['蒜蓉西兰花','调改店'],['红烧茄子','非调改店'],['京酱肉丝','调改店'],['锅包肉','通用']].forEach((d, i) => db.prepare('INSERT INTO dishes (name, dish_group, sort_order) VALUES (?,?,?)').run(d[0], d[1], i));
    })();
  }
  console.log(`[DB] SQLite 就绪 ${DB_PATH}`);
}

// ── 通用查询辅助 ──
function q(text, params) {
  if (pool) return pool.query(text, params).then(r => r.rows);
  throw new Error('PostgreSQL 未连接');
}

// ── Regions ──
async function getAllRegions() { return await q('SELECT * FROM regions ORDER BY sort_order'); }
async function addRegion(name, webhookUrl) {
  await q('INSERT INTO regions (name, webhook_url, sort_order) VALUES ($1,$2,COALESCE((SELECT MAX(sort_order)+1 FROM regions),0))', [name, webhookUrl || '']);
}
async function updateRegion(id, name, webhookUrl) { await q('UPDATE regions SET name=$1,webhook_url=$2 WHERE id=$3', [name, webhookUrl || '', id]); }
async function deleteRegion(id) { await q('DELETE FROM regions WHERE id=$1', [id]); }

// ── Stores ──
async function getActiveStores() { return await q('SELECT id,name,region_id FROM stores WHERE active=true ORDER BY sort_order'); }
async function getActiveStoresByRegion(rid) { return await q('SELECT id,name FROM stores WHERE active=true AND region_id=$1 ORDER BY sort_order', [rid]); }
async function getAllStores() { return await q('SELECT s.*,r.name as region_name FROM stores s LEFT JOIN regions r ON s.region_id=r.id ORDER BY s.sort_order'); }
async function addStore(name, regionId) { await q('INSERT INTO stores (region_id,name,sort_order) VALUES ($1,$2,COALESCE((SELECT MAX(sort_order)+1 FROM stores),0))', [regionId || 0, name]); }
async function updateStore(id, name) { await q('UPDATE stores SET name=$1 WHERE id=$2', [name, id]); }
async function toggleStore(id) { await q('UPDATE stores SET active = NOT active WHERE id=$1', [id]); }
async function deleteStore(id) { await q('DELETE FROM stores WHERE id=$1', [id]); }

// ── Dishes ──
async function getActiveDishes() { return await q('SELECT id,name,dish_group FROM dishes WHERE active=true ORDER BY sort_order'); }
async function getAllDishes() { return await q('SELECT * FROM dishes ORDER BY sort_order'); }
async function addDish(name, dishGroup) { await q('INSERT INTO dishes (name,dish_group,sort_order) VALUES ($1,$2,COALESCE((SELECT MAX(sort_order)+1 FROM dishes),0))', [name, dishGroup || '通用']); }
async function updateDish(id, name, dishGroup) { dishGroup ? await q('UPDATE dishes SET name=$1,dish_group=$2 WHERE id=$3', [name, dishGroup, id]) : await q('UPDATE dishes SET name=$1 WHERE id=$2', [name, id]); }
async function toggleDish(id) { await q('UPDATE dishes SET active = NOT active WHERE id=$1', [id]); }
async function deleteDish(id) { await q('DELETE FROM dishes WHERE id=$1', [id]); }

// ── Submissions ──
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
