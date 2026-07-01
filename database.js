const { createClient } = require('@libsql/client');
const path = require('path');

// Turso 浜戠 SQLite锛堢敓浜х幆澧冿級鎴栨湰鍦?libsql锛堝紑鍙戠幆澧冿級
const DB_URL = process.env.TURSO_DATABASE_URL || 'file:' + path.join(__dirname, 'data', 'food-waste.db');
const DB_TOKEN = process.env.TURSO_AUTH_TOKEN || '';

const client = createClient({ url: DB_URL, authToken: DB_TOKEN });

// ===================== 鍒濆鍖?=====================

async function initDb() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      webhook_url TEXT NOT NULL DEFAULT '',
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
  `);

  // 鍞竴绱㈠紩锛圕REATE INDEX IF NOT EXISTS 鐢ㄨ€佸啓娉曪級
  try {
    await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_store_date ON submissions(store_id, date)');
  } catch (_) {}

  // 绉嶅瓙鏁版嵁
  const storeCount = (await client.execute('SELECT COUNT(*) as cnt FROM stores')).rows[0].cnt;
  if (storeCount === 0) {
    const stores = ['鎬诲簵','涓€鍒嗗簵','浜屽垎搴?,'涓夊垎搴?,'鍥涘垎搴?,'浜斿垎搴?,'鍏垎搴?,'涓冨垎搴?,'鍏垎搴?,'涔濆垎搴?];
    for (let i = 0; i < stores.length; i++) {
      await client.execute('INSERT INTO stores (name, sort_order, webhook_url) VALUES (?, ?, ?)', [stores[i], i, '']);
    }
  }
  const dishCount = (await client.execute('SELECT COUNT(*) as cnt FROM dishes')).rows[0].cnt;
  if (dishCount === 0) {
    const dishes = ['绾㈢儳鑲?,'绯栭唻鎺掗','娓呰捀椴堥奔','瀹繚楦′竵','楹诲﹩璞嗚厫','鍥為攨鑲?,'姘寸叜楸?,'骞茬吀鍥涘璞?,'楸奸鑲変笣','瑗跨孩鏌跨倰铔?,'閰歌荆鍦熻眴涓?,'钂滆搲瑗垮叞鑺?,'绾㈢儳鑼勫瓙','浜叡鑲変笣','閿呭寘鑲?];
    for (let i = 0; i < dishes.length; i++) {
      await client.execute('INSERT INTO dishes (name, sort_order) VALUES (?, ?)', [dishes[i], i]);
    }
  }
}

// ===================== Stores =====================

async function getActiveStores() {
  const r = await client.execute('SELECT id, name FROM stores WHERE active = 1 ORDER BY sort_order');
  return r.rows;
}

async function getAllStores() {
  const r = await client.execute('SELECT * FROM stores ORDER BY sort_order');
  return r.rows;
}

async function addStore(name, webhookUrl = '') {
  const max = (await client.execute('SELECT MAX(sort_order) as m FROM stores')).rows[0]?.m || 0;
  const r = await client.execute('INSERT INTO stores (name, webhook_url, sort_order) VALUES (?, ?, ?)', [name, webhookUrl, max + 1]);
  return { lastInsertRowid: Number(r.lastInsertRowid) };
}

async function updateStore(id, name) {
  return client.execute('UPDATE stores SET name = ? WHERE id = ?', [name, id]);
}

async function updateStoreWebhook(id, webhookUrl) {
  return client.execute('UPDATE stores SET webhook_url = ? WHERE id = ?', [webhookUrl, id]);
}

async function toggleStore(id) {
  const s = (await client.execute('SELECT active FROM stores WHERE id = ?', [id])).rows[0];
  return client.execute('UPDATE stores SET active = ? WHERE id = ?', [s?.active ? 0 : 1, id]);
}

async function deleteStore(id) {
  return client.execute('DELETE FROM stores WHERE id = ?', [id]);
}

// ===================== Dishes =====================

async function getActiveDishes() {
  const r = await client.execute('SELECT id, name FROM dishes WHERE active = 1 ORDER BY sort_order');
  return r.rows;
}

async function getAllDishes() {
  const r = await client.execute('SELECT * FROM dishes ORDER BY sort_order');
  return r.rows;
}

async function addDish(name) {
  const max = (await client.execute('SELECT MAX(sort_order) as m FROM dishes')).rows[0]?.m || 0;
  const r = await client.execute('INSERT INTO dishes (name, sort_order) VALUES (?, ?)', [name, max + 1]);
  return { lastInsertRowid: Number(r.lastInsertRowid) };
}

async function updateDish(id, name) {
  return client.execute('UPDATE dishes SET name = ? WHERE id = ?', [name, id]);
}

async function toggleDish(id) {
  const d = (await client.execute('SELECT active FROM dishes WHERE id = ?', [id])).rows[0];
  return client.execute('UPDATE dishes SET active = ? WHERE id = ?', [d?.active ? 0 : 1, id]);
}

async function deleteDish(id) {
  return client.execute('DELETE FROM dishes WHERE id = ?', [id]);
}

// ===================== Submissions =====================

async function submitReport(storeId, storeName, date, items, submitTime) {
  return client.execute(
    `INSERT OR REPLACE INTO submissions (store_id, store_name, date, items, submit_time) VALUES (?, ?, ?, ?, ?)`,
    [storeId, storeName, date, items, submitTime]
  );
}

async function getSubmission(storeId, date) {
  const r = await client.execute('SELECT * FROM submissions WHERE store_id = ? AND date = ?', [storeId, date]);
  return r.rows[0] || null;
}

async function getTodaySubmissions(date) {
  const r = await client.execute('SELECT * FROM submissions WHERE date = ?', [date]);
  return r.rows;
}

async function getTodaySummary(date) {
  const submitted = await getTodaySubmissions(date);
  const allActive = await getActiveStores();
  const submittedIds = new Set(submitted.map(s => s.store_id));
  const notSubmitted = allActive.filter(s => !submittedIds.has(s.id));
  return { submitted, notSubmitted, allStores: allActive };
}

module.exports = {
  initDb, client,
  getActiveStores, getAllStores,
  addStore, updateStore, toggleStore, deleteStore, updateStoreWebhook,
  getActiveDishes, getAllDishes,
  addDish, updateDish, toggleDish, deleteDish,
  submitReport, getSubmission, getTodaySubmissions, getTodaySummary,
};
