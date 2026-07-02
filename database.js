// ===================== 双数据库（PostgreSQL / SQLite回退） =====================

const path = require('path');
const fs = require('fs');

let db;         // SQLite数据库实例（回退时用）
let pgPool;     // PostgreSQL连接池
let isPg = false;

// ── 初始化 ──

async function initDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { initSqlite(); return; }

  const { Pool } = require('pg');
  pgPool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  try {
    await pgPool.query('SELECT 1');
    console.log('[DB] ✅ PostgreSQL 连接成功');
    await createPgTables();
    await seedPgData();
    isPg = true;
  } catch (e) {
    console.error('[DB] ❌ PostgreSQL:', e.message);
    pgPool = null;
    initSqlite();
  }
}

async function createPgTables() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS regions (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, webhook_url TEXT NOT NULL DEFAULT '', sort_order INT NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS stores (id SERIAL PRIMARY KEY, region_id INT DEFAULT 0, name TEXT NOT NULL UNIQUE, active BOOLEAN NOT NULL DEFAULT TRUE, store_group TEXT NOT NULL DEFAULT '通用', sort_order INT NOT NULL DEFAULT 0);
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
  const { rows: dc } = await pgPool.query("SELECT COUNT(*) as c FROM dishes");
  if (parseInt(dc[0].c) === 0) {
    await pgPool.query(`INSERT INTO dishes (name, dish_group, sort_order) VALUES
      ('红烧肉','调改店',0),('糖醋排骨','非调改店',1),('清蒸鲈鱼','调改店',2),('宫保鸡丁','通用',3),
      ('麻婆豆腐','非调改店',4),('回锅肉','调改店',5),('水煮鱼','非调改店',6),('干煸四季豆','通用',7),
      ('鱼香肉丝','调改店',8),('西红柿炒蛋','通用',9),('酸辣土豆丝','非调改店',10),('蒜蓉西兰花','调改店',11),
      ('红烧茄子','非调改店',12),('京酱肉丝','调改店',13),('锅包肉','通用',14)
    ON CONFLICT (name) DO NOTHING`);
  }
  const { rows: sc } = await pgPool.query("SELECT COUNT(*) as c FROM stores");
  if (parseInt(sc[0].c) === 0) {
    await pgPool.query(`INSERT INTO stores (region_id, name, store_group, sort_order) VALUES
      (1,'绿岛花园店','调改店',0),(1,'石岩主场店','非调改店',1),(1,'大朗犀牛坡店','调改店',2),
      (1,'横岗新世界店','非调改店',3),(1,'松山湖绿荷居店','通用',4),(1,'松山湖科苑店','调改店',5),(1,'大朗体育馆店','非调改店',6)
    ON CONFLICT (name) DO NOTHING`);
  }
}

// ── SQLite回退 ──

function initSqlite() {
  const Database = require('better-sqlite3');
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'food-waste.db');
  if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS regions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, webhook_url TEXT DEFAULT '', sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS stores (id INTEGER PRIMARY KEY AUTOINCREMENT, region_id INTEGER DEFAULT 0, name TEXT UNIQUE, active INTEGER DEFAULT 1, store_group TEXT DEFAULT '通用', sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS dishes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, active INTEGER DEFAULT 1, dish_group TEXT DEFAULT '通用', sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER, region_id INTEGER DEFAULT 0, store_name TEXT, date TEXT, items TEXT, submit_time TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_store_date ON submissions(store_id, date);
  `);
  ['region_id','active','sort_order','store_group'].forEach(c => {
    if (!db.prepare("PRAGMA table_info(stores)").all().map(x=>x.name).includes(c))
      db.exec(`ALTER TABLE stores ADD COLUMN ${c} ${c==='active'?'INTEGER DEFAULT 1':c==='store_group'?"TEXT DEFAULT '通用'":"INTEGER DEFAULT 0"}`);
  });
  if (!db.prepare("PRAGMA table_info(dishes)").all().map(x=>x.name).includes('dish_group'))
    db.exec("ALTER TABLE dishes ADD COLUMN dish_group TEXT DEFAULT '通用'");

  if (db.prepare('SELECT COUNT(*) as c FROM regions').get().c === 0) {
    db.transaction(() => {
      ['袁东升','夏志平','刘兆鹏','刘广','昌跃兵','王杰','王海龙','罗爱民','贺剑'].forEach((n,i)=>db.prepare('INSERT INTO regions (name,webhook_url,sort_order) VALUES (?,?,?)').run(n,i===0?'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=44356646-0dda-484b-9a79-fa0ad45b8a50':'',i));
    })();
  }
  if (db.prepare('SELECT COUNT(*) as c FROM stores').get().c === 0) {
    db.transaction(() => {
      [['绿岛花园店','调改店'],['石岩主场店','非调改店'],['大朗犀牛坡店','调改店'],['横岗新世界店','非调改店'],['松山湖绿荷居店','通用'],['松山湖科苑店','调改店'],['大朗体育馆店','非调改店']].forEach((s,i)=>db.prepare('INSERT INTO stores (region_id,name,store_group,sort_order) VALUES (?,?,?,?)').run(1,s[0],s[1],i));
    })();
  }
  if (db.prepare('SELECT COUNT(*) as c FROM dishes').get().c === 0) {
    db.transaction(() => {
      [['红烧肉','调改店'],['糖醋排骨','非调改店'],['清蒸鲈鱼','调改店'],['宫保鸡丁','通用'],['麻婆豆腐','非调改店'],['回锅肉','调改店'],['水煮鱼','非调改店'],['干煸四季豆','通用'],['鱼香肉丝','调改店'],['西红柿炒蛋','通用'],['酸辣土豆丝','非调改店'],['蒜蓉西兰花','调改店'],['红烧茄子','非调改店'],['京酱肉丝','调改店'],['锅包肉','通用']].forEach((d,i)=>db.prepare('INSERT INTO dishes (name,dish_group,sort_order) VALUES (?,?,?)').run(d[0],d[1],i));
    })();
  }
  console.log(`[DB] SQLite 就绪 ${DB_PATH}`);
}

// ── 查询辅助 ──

async function q(text, params) {
  if (isPg) return (await pgPool.query(text, params)).rows;
  if (params) {
    const stmt = db.prepare(text);
    if (/^\s*(SELECT|WITH)/i.test(text)) return stmt.all(...params);
    stmt.run(...params); return [];
  }
  if (/^\s*(SELECT|WITH)/i.test(text)) return db.prepare(text).all();
  db.prepare(text).run(); return [];
}

// ===================== Regions =====================

async function getAllRegions() { return await q('SELECT * FROM regions ORDER BY sort_order'); }
async function addRegion(name, webhookUrl) {
  if (isPg) await q('INSERT INTO regions (name,webhook_url,sort_order) VALUES ($1,$2,(SELECT COALESCE(MAX(sort_order),0)+1 FROM regions))', [name, webhookUrl||'']);
  else { const m=db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 as m FROM regions').get().m; q('INSERT INTO regions (name,webhook_url,sort_order) VALUES (?,?,?)', [name, webhookUrl||'', m]); }
}
async function updateRegion(id, name, webhookUrl) { await q('UPDATE regions SET name=$1, webhook_url=$2 WHERE id=$3', [name, webhookUrl||'', id]); }
async function deleteRegion(id) { await q('UPDATE stores SET region_id=0 WHERE region_id=$1', [id]); await q('DELETE FROM regions WHERE id=$1', [id]); }
async function reorderRegion(id, direction) {
  const r = (await q('SELECT id, sort_order FROM regions WHERE id=$1', [id]))[0];
  if (!r) return;
  const swap = direction === 'up'
    ? (await q('SELECT id, sort_order FROM regions WHERE sort_order<$1 ORDER BY sort_order DESC', [r.sort_order]))[0]
    : (await q('SELECT id, sort_order FROM regions WHERE sort_order>$1 ORDER BY sort_order ASC', [r.sort_order]))[0];
  if (!swap) return;
  await q('UPDATE regions SET sort_order=$1 WHERE id=$2', [swap.sort_order, r.id]);
  await q('UPDATE regions SET sort_order=$1 WHERE id=$2', [r.sort_order, swap.id]);
}

// ===================== Stores =====================

async function getActiveStores() { return await q('SELECT id,name,region_id,store_group FROM stores WHERE active=1 ORDER BY sort_order'); }
async function getActiveStoresByRegion(rid) { return await q('SELECT id,name FROM stores WHERE active=1 AND region_id=$1 ORDER BY sort_order', [rid]); }
async function getAllStores() { return await q('SELECT s.*, r.name as region_name FROM stores s LEFT JOIN regions r ON s.region_id=r.id ORDER BY s.sort_order'); }
async function addStore(name, regionId, storeGroup) {
  if (isPg) await q('INSERT INTO stores (region_id,name,store_group,sort_order) VALUES ($1,$2,$3,(SELECT COALESCE(MAX(sort_order),0)+1 FROM stores))', [regionId||0, name, storeGroup||'通用']);
  else { const m=db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 as m FROM stores').get().m; q('INSERT INTO stores (region_id,name,store_group,sort_order) VALUES (?,?,?,?)', [regionId||0, name, storeGroup||'通用', m]); }
}
async function updateStore(id, name) { await q('UPDATE stores SET name=$1 WHERE id=$2', [name, id]); }
async function updateStoreGroup(id, storeGroup) { await q('UPDATE stores SET store_group=$1 WHERE id=$2', [storeGroup, id]); }
async function toggleStore(id) {
  const s = (await q('SELECT active FROM stores WHERE id=$1', [id]))[0];
  const v = isPg ? (s?.active ? false : true) : (s?.active ? 0 : 1);
  await q('UPDATE stores SET active=$1 WHERE id=$2', [v, id]);
}
async function deleteStore(id) { await q('DELETE FROM stores WHERE id=$1', [id]); }

// ===================== Dishes =====================

async function getActiveDishes() { return await q('SELECT id,name,dish_group FROM dishes WHERE active=1 ORDER BY sort_order'); }
async function getAllDishes() { return await q('SELECT * FROM dishes ORDER BY sort_order'); }
async function addDish(name, dishGroup) {
  if (isPg) await q('INSERT INTO dishes (name,dish_group,sort_order) VALUES ($1,$2,(SELECT COALESCE(MAX(sort_order),0)+1 FROM dishes))', [name, dishGroup||'通用']);
  else { const m=db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 as m FROM dishes').get().m; q('INSERT INTO dishes (name,dish_group,sort_order) VALUES (?,?,?)', [name, dishGroup||'通用', m]); }
}
async function updateDish(id, name, dishGroup) {
  dishGroup ? await q('UPDATE dishes SET name=$1,dish_group=$2 WHERE id=$3', [name, dishGroup, id]) : await q('UPDATE dishes SET name=$1 WHERE id=$2', [name, id]);
}
async function toggleDish(id) {
  const d = (await q('SELECT active FROM dishes WHERE id=$1', [id]))[0];
  const v = isPg ? (d?.active ? false : true) : (d?.active ? 0 : 1);
  await q('UPDATE dishes SET active=$1 WHERE id=$2', [v, id]);
}
async function deleteDish(id) { await q('DELETE FROM dishes WHERE id=$1', [id]); }

// ===================== Submissions =====================

async function submitReport(storeId, regionId, storeName, date, items, submitTime) {
  await q('DELETE FROM submissions WHERE store_id=$1 AND date=$2', [storeId, date]);
  await q('INSERT INTO submissions (store_id,region_id,store_name,date,items,submit_time) VALUES ($1,$2,$3,$4,$5,$6)', [storeId, regionId||0, storeName, date, items, submitTime]);
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
  initDb, getAllRegions, addRegion, updateRegion, deleteRegion, reorderRegion,
  getActiveStores, getActiveStoresByRegion, getAllStores, addStore, updateStore, updateStoreGroup, toggleStore, deleteStore,
  getActiveDishes, getAllDishes, addDish, updateDish, toggleDish, deleteDish,
  submitReport, getSubmission, getTodaySubmissions, getTodaySummary, getTodaySummaryByRegion,
};
