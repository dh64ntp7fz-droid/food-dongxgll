const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'food-waste.db');

// 确保 data 目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let db;

// ===================== 初始化=====================

function initDb() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS dishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      store_name TEXT NOT NULL,
      date TEXT NOT NULL,
      items TEXT NOT NULL,
      submit_time TEXT NOT NULL,
      FOREIGN KEY (store_id) REFERENCES stores(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_store_date ON submissions(store_id, date);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
  `);

  // 种子数据
  const storeCount = db.prepare('SELECT COUNT(*) as cnt FROM stores').get().cnt;
  if (storeCount === 0) {
    const insertStore = db.prepare('INSERT INTO stores (name, sort_order) VALUES (?, ?)');
    const stores = [
      '绿岛花园店', '石岩主场店', '大朗/牛陂店', '横岗店',
      '绿荷/育儿店', '科茗店', '体育馆店'
    ];
    const tx = db.transaction(() => {
      stores.forEach((s, i) => insertStore.run(s, i));
    });
    tx();
  }

  // 默认 Webhook
  const whCount = db.prepare("SELECT COUNT(*) as cnt FROM settings WHERE key='webhook_url'").get().cnt;
  if (whCount === 0) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('webhook_url', ?)").run(
      'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=44356646-0dda-484b-9a79-fa0ad45b8a50'
    );
  }

  const dishCount = db.prepare('SELECT COUNT(*) as cnt FROM dishes').get().cnt;
  if (dishCount === 0) {
    const insertDish = db.prepare('INSERT INTO dishes (name, sort_order) VALUES (?, ?)');
    const dishes = [
      '红烧肉', '糖醋排骨', '清蒸鲈鱼', '宫保鸡丁', '麻婆豆腐',
      '回锅肉', '水煮鱼', '干煸四季豆', '鱼香肉丝', '西红柿炒蛋',
      '酸辣土豆丝', '蒜蓉西兰花', '红烧茄子', '京酱肉丝', '锅包肉'
    ];
    const tx = db.transaction(() => {
      dishes.forEach((d, i) => insertDish.run(d, i));
    });
    tx();
  }

  console.log(`[DB] 数据库就绪 ${DB_PATH}`);
  return db;
}

// ===================== Stores =====================

function getActiveStores() {
  return db.prepare('SELECT id, name FROM stores WHERE active = 1 ORDER BY sort_order').all();
}

function getAllStores() {
  return db.prepare('SELECT * FROM stores ORDER BY sort_order').all();
}

function addStore(name, webhookUrl = '') {
  const max = db.prepare('SELECT MAX(sort_order) as m FROM stores').get()?.m || 0;
  return db.prepare('INSERT INTO stores (name, webhook_url, sort_order) VALUES (?, ?, ?)').run(name, webhookUrl, max + 1);
}

function updateStore(id, name) {
  return db.prepare('UPDATE stores SET name = ? WHERE id = ?').run(name, id);
}

function updateStoreWebhook(id, webhookUrl) {
  return db.prepare('UPDATE stores SET webhook_url = ? WHERE id = ?').run(webhookUrl, id);
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
  return db.prepare('SELECT id, name FROM dishes WHERE active = 1 ORDER BY sort_order').all();
}

function getAllDishes() {
  return db.prepare('SELECT * FROM dishes ORDER BY sort_order').all();
}

function addDish(name) {
  const max = db.prepare('SELECT MAX(sort_order) as m FROM dishes').get()?.m || 0;
  return db.prepare('INSERT INTO dishes (name, sort_order) VALUES (?, ?)').run(name, max + 1);
}

function updateDish(id, name) {
  return db.prepare('UPDATE dishes SET name = ? WHERE id = ?').run(name, id);
}

function toggleDish(id) {
  const d = db.prepare('SELECT active FROM dishes WHERE id = ?').get(id);
  return db.prepare('UPDATE dishes SET active = ? WHERE id = ?').run(d?.active ? 0 : 1, id);
}

function deleteDish(id) {
  return db.prepare('DELETE FROM dishes WHERE id = ?').run(id);
}

// ===================== Settings =====================

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// ===================== Submissions =====================

function submitReport(storeId, storeName, date, items, submitTime) {
  return db.prepare(
    'INSERT OR REPLACE INTO submissions (store_id, store_name, date, items, submit_time) VALUES (?, ?, ?, ?, ?)'
  ).run(storeId, storeName, date, items, submitTime);
}

function getSubmission(storeId, date) {
  return db.prepare('SELECT * FROM submissions WHERE store_id = ? AND date = ?').get(storeId, date);
}

function getTodaySubmissions(date) {
  return db.prepare('SELECT * FROM submissions WHERE date = ?').all(date);
}

function getTodaySummary(date) {
  const submitted = getTodaySubmissions(date);
  const allActive = getActiveStores();
  const submittedIds = new Set(submitted.map(s => s.store_id));
  const notSubmitted = allActive.filter(s => !submittedIds.has(s.id));
  return { submitted, notSubmitted, allStores: allActive };
}

module.exports = {
  initDb,
  getActiveStores, getAllStores,
  addStore, updateStore, toggleStore, deleteStore,
  getActiveDishes, getAllDishes,
  addDish, updateDish, toggleDish, deleteDish,
  submitReport, getSubmission, getTodaySubmissions, getTodaySummary,
  getSetting, setSetting,
};
