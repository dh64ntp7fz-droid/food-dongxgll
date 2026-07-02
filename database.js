// ===================== SQLite 数据库层 =====================
// 纯本地文件数据库，部署不连接任何外部服务

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'food-waste.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let db;

function initDb() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS regions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, webhook_url TEXT DEFAULT '', sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS stores (id INTEGER PRIMARY KEY AUTOINCREMENT, region_id INTEGER DEFAULT 0, name TEXT UNIQUE, active INTEGER DEFAULT 1, store_group TEXT DEFAULT '调改店', sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS dishes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, active INTEGER DEFAULT 1, dish_group TEXT DEFAULT '通用', sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER, region_id INTEGER DEFAULT 0, store_name TEXT, date TEXT, items TEXT, submit_time TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_store_date ON submissions(store_id, date);
  `);

  // 兼容旧列
  ['region_id','active','sort_order','store_group'].forEach(c => {
    if (!db.prepare("PRAGMA table_info(stores)").all().map(x=>x.name).includes(c))
      db.exec(`ALTER TABLE stores ADD COLUMN ${c} ${c==='active'?'INTEGER DEFAULT 1':c==='store_group'?"TEXT DEFAULT '调改店'":"INTEGER DEFAULT 0"}`);
  });
  if (!db.prepare("PRAGMA table_info(dishes)").all().map(x=>x.name).includes('dish_group'))
    db.exec("ALTER TABLE dishes ADD COLUMN dish_group TEXT DEFAULT '通用'");

  // 种子数据（只有空表时执行）
  if (db.prepare('SELECT COUNT(*) as c FROM regions').get().c === 0) {
    const tx = db.transaction(() => {
      ['袁东升','夏志平','刘兆鹏','刘广','昌跃兵','王杰','王海龙','罗爱民','贺剑'].forEach((n,i) =>
        db.prepare('INSERT INTO regions (name, webhook_url, sort_order) VALUES (?,?,?)').run(n, i===0?'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=44356646-0dda-484b-9a79-fa0ad45b8a50':'', i)
      );
    });
    tx();
  }
  if (db.prepare('SELECT COUNT(*) as c FROM stores').get().c === 0) {
    const tx = db.transaction(() => {
      [['绿岛花园店','调改店'],['石岩主场店','非调改店'],['大朗犀牛坡店','调改店'],['横岗新世界店','非调改店'],['松山湖绿荷居店','非调改店'],['松山湖科苑店','调改店'],['大朗体育馆店','非调改店']].forEach((s,i) =>
        db.prepare('INSERT INTO stores (region_id, name, store_group, sort_order) VALUES (?,?,?,?)').run(1, s[0], s[1], i)
      );
    });
    tx();
  }
  if (db.prepare('SELECT COUNT(*) as c FROM dishes').get().c === 0) {
    const tx = db.transaction(() => {
      [['红烧肉','调改店'],['糖醋排骨','非调改店'],['清蒸鲈鱼','调改店'],['宫保鸡丁','通用'],['麻婆豆腐','非调改店'],['回锅肉','调改店'],['水煮鱼','非调改店'],['干煸四季豆','通用'],['鱼香肉丝','调改店'],['西红柿炒蛋','通用'],['酸辣土豆丝','非调改店'],['蒜蓉西兰花','调改店'],['红烧茄子','非调改店'],['京酱肉丝','调改店'],['锅包肉','通用']].forEach((d,i) =>
        db.prepare('INSERT INTO dishes (name, dish_group, sort_order) VALUES (?,?,?)').run(d[0], d[1], i)
      );
    });
    tx();
  }

  console.log(`[DB] 就绪 ${DB_PATH}`);
}

// ===================== Regions =====================

function getAllRegions() { return db.prepare('SELECT * FROM regions ORDER BY sort_order').all(); }
function addRegion(name, webhookUrl) {
  const max = db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 as m FROM regions').get().m;
  db.prepare('INSERT INTO regions (name, webhook_url, sort_order) VALUES (?,?,?)').run(name, webhookUrl||'', max);
}
function updateRegion(id, name, webhookUrl) { db.prepare('UPDATE regions SET name=?, webhook_url=? WHERE id=?').run(name, webhookUrl||'', id); }
function deleteRegion(id) { db.prepare('UPDATE stores SET region_id=0 WHERE region_id=?').run(id); db.prepare('DELETE FROM regions WHERE id=?').run(id); }
function reorderRegion(id, direction) {
  const regions = db.prepare('SELECT id, sort_order FROM regions ORDER BY sort_order').all();
  const idx = regions.findIndex(r => r.id === id);
  if (idx < 0) return;
  const swap = direction === 'up' ? idx-1 : idx+1;
  if (swap < 0 || swap >= regions.length) return;
  db.prepare('UPDATE regions SET sort_order=? WHERE id=?').run(regions[swap].sort_order, id);
  db.prepare('UPDATE regions SET sort_order=? WHERE id=?').run(regions[idx].sort_order, regions[swap].id);
}

// ===================== Stores =====================

function getActiveStores() { return db.prepare('SELECT id,name,region_id,store_group FROM stores WHERE active=1 ORDER BY sort_order').all(); }
function getActiveStoresByRegion(rid) { return db.prepare('SELECT id,name FROM stores WHERE active=1 AND region_id=? ORDER BY sort_order').all(rid); }
function getAllStores() { return db.prepare('SELECT s.*, r.name as region_name FROM stores s LEFT JOIN regions r ON s.region_id=r.id ORDER BY s.sort_order').all(); }
function addStore(name, regionId, storeGroup) {
  const max = db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 as m FROM stores').get().m;
  const r = db.prepare('INSERT INTO stores (region_id, name, store_group, sort_order) VALUES (?,?,?,?)').run(regionId||0, name, storeGroup||'调改店', max);
  return { lastInsertRowid: r.lastInsertRowid };
}
function updateStore(id, name) { db.prepare('UPDATE stores SET name=? WHERE id=?').run(name, id); }
function updateStoreGroup(id, storeGroup) { db.prepare('UPDATE stores SET store_group=? WHERE id=?').run(storeGroup, id); }
function toggleStore(id) {
  const s = db.prepare('SELECT active FROM stores WHERE id=?').get(id);
  db.prepare('UPDATE stores SET active=? WHERE id=?').run(s?.active ? 0 : 1, id);
}
function deleteStore(id) { db.prepare('DELETE FROM stores WHERE id=?').run(id); }

// ===================== Dishes =====================

function getActiveDishes() { return db.prepare('SELECT id,name,dish_group FROM dishes WHERE active=1 ORDER BY sort_order').all(); }
function getAllDishes() { return db.prepare('SELECT * FROM dishes ORDER BY sort_order').all(); }
function addDish(name, dishGroup) {
  const max = db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 as m FROM dishes').get().m;
  db.prepare('INSERT INTO dishes (name, dish_group, sort_order) VALUES (?,?,?)').run(name, dishGroup||'通用', max);
}
function updateDish(id, name, dishGroup) {
  if (dishGroup) db.prepare('UPDATE dishes SET name=?, dish_group=? WHERE id=?').run(name, dishGroup, id);
  else db.prepare('UPDATE dishes SET name=? WHERE id=?').run(name, id);
}
function toggleDish(id) {
  const d = db.prepare('SELECT active FROM dishes WHERE id=?').get(id);
  db.prepare('UPDATE dishes SET active=? WHERE id=?').run(d?.active ? 0 : 1, id);
}
function deleteDish(id) { db.prepare('DELETE FROM dishes WHERE id=?').run(id); }

// ===================== Submissions =====================

function submitReport(storeId, regionId, storeName, date, items, submitTime) {
  db.prepare('DELETE FROM submissions WHERE store_id=? AND date=?').run(storeId, date);
  db.prepare('INSERT INTO submissions (store_id,region_id,store_name,date,items,submit_time) VALUES (?,?,?,?,?,?)').run(storeId, regionId||0, storeName, date, items, submitTime);
}
function getSubmission(storeId, date) { return db.prepare('SELECT * FROM submissions WHERE store_id=? AND date=?').get(storeId, date); }
function getTodaySubmissions(date) { return db.prepare('SELECT * FROM submissions WHERE date=?').all(date); }
function getTodaySubmissionsByRegion(date, rid) { return db.prepare('SELECT * FROM submissions WHERE date=? AND region_id=?').all(date, rid); }
function getTodaySummary(date) {
  const submitted = getTodaySubmissions(date);
  const allActive = getActiveStores();
  const ids = new Set(submitted.map(s => s.store_id));
  return { submitted, notSubmitted: allActive.filter(s => !ids.has(s.id)), allStores: allActive };
}
function getTodaySummaryByRegion(date, rid) {
  const submitted = getTodaySubmissionsByRegion(date, rid);
  const allActive = getActiveStoresByRegion(rid);
  const ids = new Set(submitted.map(s => s.store_id));
  return { submitted, notSubmitted: allActive.filter(s => !ids.has(s.id)), allStores: allActive };
}

module.exports = {
  initDb, getAllRegions, addRegion, updateRegion, deleteRegion, reorderRegion,
  getActiveStores, getActiveStoresByRegion, getAllStores, addStore, updateStore, updateStoreGroup, toggleStore, deleteStore,
  getActiveDishes, getAllDishes, addDish, updateDish, toggleDish, deleteDish,
  submitReport, getSubmission, getTodaySubmissions, getTodaySummary, getTodaySummaryByRegion,
};
