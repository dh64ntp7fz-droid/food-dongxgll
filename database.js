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
  db.pragma('foreign_keys = ON');

  // 建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      webhook_url TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      region_id INTEGER DEFAULT 0,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS dishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      dish_group TEXT NOT NULL DEFAULT '通用',
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      region_id INTEGER DEFAULT 0,
      store_name TEXT NOT NULL,
      date TEXT NOT NULL,
      items TEXT NOT NULL,
      submit_time TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_store_date ON submissions(store_id, date);
  `);

  // 兼容旧表
  const sCols = db.prepare("PRAGMA table_info(stores)").all().map(c => c.name);
  if (!sCols.includes('region_id')) db.exec("ALTER TABLE stores ADD COLUMN region_id INTEGER DEFAULT 0");
  const dCols = db.prepare("PRAGMA table_info(dishes)").all().map(c => c.name);
  if (!dCols.includes('dish_group')) db.exec("ALTER TABLE dishes ADD COLUMN dish_group TEXT NOT NULL DEFAULT '通用'");

  // 种子数据：区域
  const regionCount = db.prepare('SELECT COUNT(*) as cnt FROM regions').get().cnt;
  if (regionCount === 0) {
    const insert = db.prepare('INSERT INTO regions (name, webhook_url, sort_order) VALUES (?, ?, ?)');
    const regions = [
      '袁东升', '夏志平', '刘兆鹏', '刘广', '昌跃兵',
      '王杰', '王海龙', '罗爱民', '贺剑'
    ];
    db.transaction(() => {
      regions.forEach((name, i) => {
        insert.run(name, '', i);
      });
    })();
  }

  // 种子数据：门店
  const storeCount = db.prepare('SELECT COUNT(*) as cnt FROM stores').get().cnt;
  if (storeCount === 0) {
    const insert = db.prepare('INSERT INTO stores (region_id, name, sort_order) VALUES (?, ?, ?)');
    db.transaction(() => {
      // 袁东升区域（region_id=1）
      [
        '绿岛花园店', '石岩主场店', '大朗犀牛坡店', '横岗新世界店',
        '松山湖绿荷居店', '松山湖科苑店', '大朗体育馆店'
      ].forEach((s, i) => insert.run(1, s, i));
      // 夏志平区域（region_id=2）— 预留，用户自行添加
    })();
  }

  // 种子数据：菜品
  const dishCount = db.prepare('SELECT COUNT(*) as cnt FROM dishes').get().cnt;
  if (dishCount === 0) {
    const insert = db.prepare('INSERT INTO dishes (name, dish_group, sort_order) VALUES (?, ?, ?)');
    const tx = db.transaction(() => {
      [['红烧肉','调改店'], ['糖醋排骨','非调改店'], ['清蒸鲈鱼','调改店'], ['宫保鸡丁','通用'],
       ['麻婆豆腐','非调改店'], ['回锅肉','调改店'], ['水煮鱼','非调改店'], ['干煸四季豆','通用'],
       ['鱼香肉丝','调改店'], ['西红柿炒蛋','通用'], ['酸辣土豆丝','非调改店'], ['蒜蓉西兰花','调改店'],
       ['红烧茄子','非调改店'], ['京酱肉丝','调改店'], ['锅包肉','通用']
      ].forEach((d, i) => insert.run(d[0], d[1], i));
    });
    tx();
  }

  console.log(`[DB] 数据库就绪 ${DB_PATH}`);
  return db;
}

// ===================== Regions =====================

function getAllRegions() {
  return db.prepare('SELECT * FROM regions ORDER BY sort_order').all();
}

function addRegion(name, webhookUrl) {
  const max = db.prepare('SELECT MAX(sort_order) as m FROM regions').get()?.m || 0;
  return db.prepare('INSERT INTO regions (name, webhook_url, sort_order) VALUES (?, ?, ?)').run(name, webhookUrl || '', max + 1);
}

function updateRegion(id, name, webhookUrl) {
  return db.prepare('UPDATE regions SET name = ?, webhook_url = ? WHERE id = ?').run(name, webhookUrl || '', id);
}

function updateRegionWebhook(id, webhookUrl) {
  return db.prepare('UPDATE regions SET webhook_url = ? WHERE id = ?').run(webhookUrl || '', id);
}

function deleteRegion(id) {
  return db.prepare('DELETE FROM regions WHERE id = ?').run(id);
}

// ===================== Stores =====================

function getActiveStores() {
  return db.prepare('SELECT id, name, region_id FROM stores WHERE active = 1 ORDER BY sort_order').all();
}

function getActiveStoresByRegion(regionId) {
  return db.prepare('SELECT id, name FROM stores WHERE active = 1 AND region_id = ? ORDER BY sort_order').all(regionId);
}

function getAllStores() {
  return db.prepare('SELECT s.*, r.name as region_name FROM stores s LEFT JOIN regions r ON s.region_id = r.id ORDER BY s.sort_order').all();
}

function addStore(name, regionId) {
  const max = db.prepare('SELECT MAX(sort_order) as m FROM stores').get()?.m || 0;
  return db.prepare('INSERT INTO stores (region_id, name, sort_order) VALUES (?, ?, ?)').run(regionId || 0, name, max + 1);
}

function updateStore(id, name) {
  return db.prepare('UPDATE stores SET name = ? WHERE id = ?').run(name, id);
}

function updateStoreRegion(id, regionId) {
  return db.prepare('UPDATE stores SET region_id = ? WHERE id = ?').run(regionId, id);
}

function toggleStore(id) {
  const s = db.prepare('SELECT active FROM stores WHERE id = ?').get(id);
  return db.prepare('UPDATE stores SET active = ? WHERE id = ?').run(s?.active ? 0 : 1, id);
}

function deleteStore(id) {
  return db.prepare('DELETE FROM stores WHERE id = ?').run(id);
}

// ===================== Dishes =====================

function getActiveDishes() {
  return db.prepare('SELECT id, name, dish_group FROM dishes WHERE active = 1 ORDER BY sort_order').all();
}

function getAllDishes() {
  return db.prepare('SELECT * FROM dishes ORDER BY sort_order').all();
}

function addDish(name, dishGroup) {
  const max = db.prepare('SELECT MAX(sort_order) as m FROM dishes').get()?.m || 0;
  return db.prepare('INSERT INTO dishes (name, dish_group, sort_order) VALUES (?, ?, ?)').run(name, dishGroup || '通用', max + 1);
}

function updateDish(id, name, dishGroup) {
  if (dishGroup !== undefined) {
    return db.prepare('UPDATE dishes SET name = ?, dish_group = ? WHERE id = ?').run(name, dishGroup, id);
  }
  return db.prepare('UPDATE dishes SET name = ? WHERE id = ?').run(name, id);
}

function toggleDish(id) {
  const d = db.prepare('SELECT active FROM dishes WHERE id = ?').get(id);
  return db.prepare('UPDATE dishes SET active = ? WHERE id = ?').run(d?.active ? 0 : 1, id);
}

function deleteDish(id) {
  return db.prepare('DELETE FROM dishes WHERE id = ?').run(id);
}

// ===================== Submissions =====================

function submitReport(storeId, regionId, storeName, date, items, submitTime) {
  return db.prepare(
    'INSERT OR REPLACE INTO submissions (store_id, region_id, store_name, date, items, submit_time) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(storeId, regionId || 0, storeName, date, items, submitTime);
}

function getSubmission(storeId, date) {
  return db.prepare('SELECT * FROM submissions WHERE store_id = ? AND date = ?').get(storeId, date);
}

function getTodaySubmissions(date) {
  return db.prepare('SELECT * FROM submissions WHERE date = ?').all(date);
}

function getTodaySubmissionsByRegion(date, regionId) {
  return db.prepare('SELECT * FROM submissions WHERE date = ? AND region_id = ?').all(date, regionId);
}

function getTodaySummary(date) {
  const submitted = getTodaySubmissions(date);
  const allActive = getActiveStores();
  const submittedIds = new Set(submitted.map(s => s.store_id));
  const notSubmitted = allActive.filter(s => !submittedIds.has(s.id));
  return { submitted, notSubmitted, allStores: allActive };
}

function getTodaySummaryByRegion(date, regionId) {
  const submitted = getTodaySubmissionsByRegion(date, regionId);
  const allActive = getActiveStoresByRegion(regionId);
  const submittedIds = new Set(submitted.map(s => s.store_id));
  const notSubmitted = allActive.filter(s => !submittedIds.has(s.id));
  return { submitted, notSubmitted, allStores: allActive };
}

module.exports = {
  initDb,
  getAllRegions, addRegion, updateRegion, updateRegionWebhook, deleteRegion,
  getActiveStores, getActiveStoresByRegion, getAllStores,
  addStore, updateStore, updateStoreRegion, toggleStore, deleteStore,
  getActiveDishes, getAllDishes,
  addDish, updateDish, toggleDish, deleteDish,
  submitReport, getSubmission, getTodaySubmissions, getTodaySummary,
  getTodaySummaryByRegion,
};
