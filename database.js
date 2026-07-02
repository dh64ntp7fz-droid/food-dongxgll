// ===================== PostgreSQL 数据库层 =====================
// 使用 Supabase 云数据库，部署永不丢失
// Render 上可直接连接，我本地测试不了但 Render 上正常

const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

let pool = null;
let sqDb = null;
let isPg = false;

async function initDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { initSqlite(); return; }

  pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    await pool.query('SELECT 1');
    console.log('[DB] ✅ PostgreSQL 连接成功');
    await setupPg();
    isPg = true;
    console.log('[DB] ✅ 数据库就绪');
  } catch (e) {
    console.error('[DB] ❌ PostgreSQL 失败:', e.message);
    pool = null;
    initSqlite();
  }
}

async function setupPg() {
  // 创建我们的表（如果不存在）
  await pool.query(`CREATE TABLE IF NOT EXISTS food_regions (id SERIAL PRIMARY KEY, name TEXT UNIQUE, webhook_url TEXT DEFAULT '', sort_order INT DEFAULT 0);`);
  await pool.query(`CREATE TABLE IF NOT EXISTS food_dishes (id SERIAL PRIMARY KEY, name TEXT UNIQUE, active BOOLEAN DEFAULT TRUE, dish_group TEXT DEFAULT '通用', sort_order INT DEFAULT 0);`);
  await pool.query(`CREATE TABLE IF NOT EXISTS food_submissions (id SERIAL PRIMARY KEY, store_id INT, region_id INT DEFAULT 0, store_name TEXT, date TEXT, items TEXT, submit_time TEXT);`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_food_submissions_store_date ON food_submissions(store_id, date);`);

  // 用 food_ 前缀避免和已有表冲突
  // 也用这个 stores 表，但加 food_ 前缀避免冲突
  await pool.query(`CREATE TABLE IF NOT EXISTS food_stores (id SERIAL PRIMARY KEY, region_id INT DEFAULT 0, name TEXT UNIQUE, active BOOLEAN DEFAULT TRUE, store_group TEXT DEFAULT '通用', sort_order INT DEFAULT 0);`);

  // 种子数据
  const rc = await pool.query("SELECT COUNT(*) as c FROM food_regions");
  if (parseInt(rc.rows[0].c) === 0) {
    await pool.query(`INSERT INTO food_regions (name, webhook_url, sort_order) VALUES
      ('袁东升','https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=44356646-0dda-484b-9a79-fa0ad45b8a50',0),
      ('夏志平','',1),('刘兆鹏','',2),('刘广','',3),('昌跃兵','',4),
      ('王杰','',5),('王海龙','',6),('罗爱民','',7),('贺剑','',8)`);
  }

  const sc = await pool.query("SELECT COUNT(*) as c FROM food_stores");
  if (parseInt(sc.rows[0].c) === 0) {
    await pool.query(`INSERT INTO food_stores (region_id, name, store_group, sort_order) VALUES
      (1,'绿岛花园店','调改店',0),(1,'石岩主场店','非调改店',1),(1,'大朗犀牛坡店','调改店',2),
      (1,'横岗新世界店','非调改店',3),(1,'松山湖绿荷居店','通用',4),
      (1,'松山湖科苑店','调改店',5),(1,'大朗体育馆店','非调改店',6)`);
  }

  const dc = await pool.query("SELECT COUNT(*) as c FROM food_dishes");
  if (parseInt(dc.rows[0].c) === 0) {
    await pool.query(`INSERT INTO food_dishes (name, dish_group, sort_order) VALUES
      ('红烧肉','调改店',0),('糖醋排骨','非调改店',1),('清蒸鲈鱼','调改店',2),('宫保鸡丁','通用',3),
      ('麻婆豆腐','非调改店',4),('回锅肉','调改店',5),('水煮鱼','非调改店',6),('干煸四季豆','通用',7),
      ('鱼香肉丝','调改店',8),('西红柿炒蛋','通用',9),('酸辣土豆丝','非调改店',10),('蒜蓉西兰花','调改店',11),
      ('红烧茄子','非调改店',12),('京酱肉丝','调改店',13),('锅包肉','通用',14)`);
  }
}

// ── SQLite 回退 ──

function initSqlite() {
  const Database = require('better-sqlite3');
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'food-waste.db');
  if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  sqDb = new Database(DB_PATH);
  sqDb.pragma('journal_mode = WAL');

  sqDb.exec(`
    CREATE TABLE IF NOT EXISTS regions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, webhook_url TEXT DEFAULT '', sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS stores (id INTEGER PRIMARY KEY AUTOINCREMENT, region_id INTEGER DEFAULT 0, name TEXT UNIQUE, active INTEGER DEFAULT 1, store_group TEXT DEFAULT '通用', sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS dishes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, active INTEGER DEFAULT 1, dish_group TEXT DEFAULT '通用', sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER, region_id INTEGER DEFAULT 0, store_name TEXT, date TEXT, items TEXT, submit_time TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_store_date ON submissions(store_id, date);
  `);
  ['region_id','active','sort_order','store_group'].forEach(c => {
    if (!sqDb.prepare("PRAGMA table_info(stores)").all().map(x=>x.name).includes(c))
      sqDb.exec(`ALTER TABLE stores ADD COLUMN ${c} ${c==='active'?'INTEGER DEFAULT 1':c==='store_group'?"TEXT DEFAULT '通用'":"INTEGER DEFAULT 0"}`);
  });
  if (!sqDb.prepare("PRAGMA table_info(dishes)").all().map(x=>x.name).includes('dish_group'))
    sqDb.exec("ALTER TABLE dishes ADD COLUMN dish_group TEXT DEFAULT '通用'");

  // 种子
  if (sqDb.prepare('SELECT COUNT(*) as c FROM regions').get().c === 0) {
    sqDb.transaction(() => {
      ['袁东升','夏志平','刘兆鹏','刘广','昌跃兵','王杰','王海龙','罗爱民','贺剑'].forEach((n,i)=>sqDb.prepare('INSERT INTO regions (name,webhook_url,sort_order) VALUES (?,?,?)').run(n,i===0?'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=44356646-0dda-484b-9a79-fa0ad45b8a50':'',i));
    })();
  }
  if (sqDb.prepare('SELECT COUNT(*) as c FROM stores').get().c === 0) {
    sqDb.transaction(() => {
      [['绿岛花园店','调改店'],['石岩主场店','非调改店'],['大朗犀牛坡店','调改店'],['横岗新世界店','非调改店'],['松山湖绿荷居店','通用'],['松山湖科苑店','调改店'],['大朗体育馆店','非调改店']].forEach((s,i)=>sqDb.prepare('INSERT INTO stores (region_id,name,store_group,sort_order) VALUES (?,?,?,?)').run(1,s[0],s[1],i));
    })();
  }
  if (sqDb.prepare('SELECT COUNT(*) as c FROM dishes').get().c === 0) {
    sqDb.transaction(() => {
      [['红烧肉','调改店'],['糖醋排骨','非调改店'],['清蒸鲈鱼','调改店'],['宫保鸡丁','通用'],['麻婆豆腐','非调改店'],['回锅肉','调改店'],['水煮鱼','非调改店'],['干煸四季豆','通用'],['鱼香肉丝','调改店'],['西红柿炒蛋','通用'],['酸辣土豆丝','非调改店'],['蒜蓉西兰花','调改店'],['红烧茄子','非调改店'],['京酱肉丝','调改店'],['锅包肉','通用']].forEach((d,i)=>sqDb.prepare('INSERT INTO dishes (name,dish_group,sort_order) VALUES (?,?,?)').run(d[0],d[1],i));
    })();
  }
  console.log(`[DB] SQLite 就绪 ${DB_PATH}`);
}

// ── 查询辅助 ──

async function q(text, params) {
  if (isPg) return (await pool.query(text, params)).rows;
  if (!sqDb) return [];
  if (params) {
    // Convert $N to ? for SQLite compatibility
    const sql = text.replace(/\$(\d+)/g, '?');
    const stmt = sqDb.prepare(sql);
    if (/^\s*(SELECT|WITH)/i.test(text)) return stmt.all(...params);
    stmt.run(...params); return [];
  }
  if (/^\s*(SELECT|WITH)/i.test(text)) return sqDb.prepare(text.replace(/\$(\d+)/g, '?')).all();
  sqDb.prepare(text.replace(/\$(\d+)/g, '?')).run(); return [];
}

// 表名映射：PostgreSQL 用 food_ 前缀
function t(table) { return isPg ? `food_${table}` : table; }

// ===================== Regions =====================

async function getAllRegions() { return await q(`SELECT * FROM ${t('regions')} ORDER BY sort_order`); }
async function addRegion(name, webhookUrl) {
  if (isPg) await q(`INSERT INTO ${t('regions')} (name,webhook_url,sort_order) VALUES ($1,$2,(SELECT COALESCE(MAX(sort_order),0)+1 FROM ${t('regions')}))`, [name, webhookUrl||'']);
  else { const m=sqDb.prepare(`SELECT COALESCE(MAX(sort_order),0)+1 as m FROM ${t('regions')}`).get().m; q(`INSERT INTO ${t('regions')} (name,webhook_url,sort_order) VALUES (?,?,?)`, [name, webhookUrl||'', m]); }
}
async function updateRegion(id, name, webhookUrl) { await q(`UPDATE ${t('regions')} SET name=$1, webhook_url=$2 WHERE id=$3`, [name, webhookUrl||'', id]); }
async function deleteRegion(id) { await q(`UPDATE ${t('stores')} SET region_id=0 WHERE region_id=$1`, [id]); await q(`DELETE FROM ${t('regions')} WHERE id=$1`, [id]); }
async function reorderRegion(id, direction) {
  const regions = await q(`SELECT id, sort_order FROM ${t('regions')} ORDER BY sort_order`);
  const idx = regions.findIndex(r => r.id === id);
  if (idx < 0) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= regions.length) return;
  await q(`UPDATE ${t('regions')} SET sort_order=$1 WHERE id=$2`, [regions[swapIdx].sort_order, id]);
  await q(`UPDATE ${t('regions')} SET sort_order=$1 WHERE id=$2`, [regions[idx].sort_order, regions[swapIdx].id]);
}

// ===================== Stores =====================

async function getActiveStores() { return await q(`SELECT id,name,region_id,store_group FROM ${t('stores')} WHERE active=1 ORDER BY sort_order`); }
async function getActiveStoresByRegion(rid) { return await q(`SELECT id,name FROM ${t('stores')} WHERE active=1 AND region_id=$1 ORDER BY sort_order`, [rid]); }
async function getAllStores() { return await q(`SELECT s.*, r.name as region_name FROM ${t('stores')} s LEFT JOIN ${t('regions')} r ON s.region_id=r.id ORDER BY s.sort_order`); }
async function addStore(name, regionId, storeGroup) {
  if (isPg) { const r = await q(`INSERT INTO ${t('stores')} (region_id,name,store_group,sort_order) VALUES ($1,$2,$3,(SELECT COALESCE(MAX(sort_order),0)+1 FROM ${t('stores')})) RETURNING id`, [regionId||0, name, storeGroup||'通用']); return { lastInsertRowid: r[0]?.id }; }
  else { const max = sqDb.prepare(`SELECT COALESCE(MAX(sort_order),0)+1 as m FROM ${t('stores')}`).get().m; const r = sqDb.prepare(`INSERT INTO ${t('stores')} (region_id,name,store_group,sort_order) VALUES (?,?,?,?)`).run(regionId||0, name, storeGroup||'通用', max); return { lastInsertRowid: r.lastInsertRowid }; }
}
async function updateStore(id, name) { await q(`UPDATE ${t('stores')} SET name=$1 WHERE id=$2`, [name, id]); }
async function updateStoreGroup(id, storeGroup) {
  if (isPg) await q(`UPDATE ${t('stores')} SET store_group=$1 WHERE id=$2`, [storeGroup, id]);
  else sqDb.prepare(`UPDATE ${t('stores')} SET store_group=? WHERE id=?`).run(storeGroup, id);
}
async function toggleStore(id) { await q(`UPDATE ${t('stores')} SET active = NOT active WHERE id=$1`, [id]); }
async function deleteStore(id) { await q(`DELETE FROM ${t('stores')} WHERE id=$1`, [id]); }

// ===================== Dishes =====================

async function getActiveDishes() { return await q(`SELECT id,name,dish_group FROM ${t('dishes')} WHERE active=1 ORDER BY sort_order`); }
async function getAllDishes() { return await q(`SELECT * FROM ${t('dishes')} ORDER BY sort_order`); }
async function addDish(name, dishGroup) {
  if (isPg) { const r = await q(`INSERT INTO ${t('dishes')} (name,dish_group,sort_order) VALUES ($1,$2,(SELECT COALESCE(MAX(sort_order),0)+1 FROM ${t('dishes')})) RETURNING id`, [name, dishGroup||'通用']); return { lastInsertRowid: r[0]?.id }; }
  else { const max = sqDb.prepare(`SELECT COALESCE(MAX(sort_order),0)+1 as m FROM ${t('dishes')}`).get().m; sqDb.prepare(`INSERT INTO ${t('dishes')} (name,dish_group,sort_order) VALUES (?,?,?)`).run(name, dishGroup||'通用', max); }
}
async function updateDish(id, name, dishGroup) {
  dishGroup ? await q(`UPDATE ${t('dishes')} SET name=$1,dish_group=$2 WHERE id=$3`, [name, dishGroup, id]) : await q(`UPDATE ${t('dishes')} SET name=$1 WHERE id=$2`, [name, id]);
}
async function toggleDish(id) { await q(`UPDATE ${t('dishes')} SET active = NOT active WHERE id=$1`, [id]); }
async function deleteDish(id) { await q(`DELETE FROM ${t('dishes')} WHERE id=$1`, [id]); }

// ===================== Submissions =====================

async function submitReport(storeId, regionId, storeName, date, items, submitTime) {
  await q(`DELETE FROM ${t('submissions')} WHERE store_id=$1 AND date=$2`, [storeId, date]);
  await q(`INSERT INTO ${t('submissions')} (store_id,region_id,store_name,date,items,submit_time) VALUES ($1,$2,$3,$4,$5,$6)`, [storeId, regionId||0, storeName, date, items, submitTime]);
}
async function getSubmission(storeId, date) { const r = await q(`SELECT * FROM ${t('submissions')} WHERE store_id=$1 AND date=$2`, [storeId, date]); return r[0] || null; }
async function getTodaySubmissions(date) { return await q(`SELECT * FROM ${t('submissions')} WHERE date=$1`, [date]); }
async function getTodaySubmissionsByRegion(date, rid) { return await q(`SELECT * FROM ${t('submissions')} WHERE date=$1 AND region_id=$2`, [date, rid]); }
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
  initDb, getAllRegions, addRegion, updateRegion, deleteRegion, reorderRegion,
  getActiveStores, getActiveStoresByRegion, getAllStores, addStore, updateStore, updateStoreGroup, toggleStore, deleteStore,
  getActiveDishes, getAllDishes, addDish, updateDish, toggleDish, deleteDish,
  submitReport, getSubmission, getTodaySubmissions, getTodaySummary, getTodaySummaryByRegion,
};
