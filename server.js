const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./database');

// 鍔犺浇 .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const t = line.trim();
    if (t && !t.startsWith('#')) {
      const i = t.indexOf('=');
      if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  });
}

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ================== 绠＄悊鍚庡彴璁よ瘉 ==================
function adminAuth(req, res, next) {
  if (req.headers['x-admin-token'] === ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: '鏈巿鏉冿紝璇峰厛鐧诲綍' });
}

// ================== 鍘ㄥ笀闀跨 API ==================

app.get('/api/stores', (_req, res) => {
  try { res.json(db.getActiveStores()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dishes', (_req, res) => {
  try { res.json(db.getActiveDishes()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/check-submission', (req, res) => {
  try {
    const sub = db.getSubmission(Number(req.query.storeId), req.query.date);
    res.json({ submitted: !!sub, data: sub || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/submit', (req, res) => {
  try {
    const { storeId, storeName, date, items, submitTime } = req.body;
    if (!storeId || !date || !items || items.length === 0) {
      return res.status(400).json({ error: '缂哄皯蹇呰鍙傛暟锛歴toreId, date, items' });
    }
    db.submitReport(storeId, storeName, date, JSON.stringify(items), submitTime);
    res.json({ success: true, message: '鎻愪氦鎴愬姛锛? });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================== 绠＄悊鍚庡彴 API ==================

app.post('/api/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) return res.json({ success: true, token: ADMIN_PASSWORD });
  return res.status(401).json({ error: '瀵嗙爜閿欒' });
});

app.post('/api/admin/verify', adminAuth, (_req, res) => res.json({ success: true }));

// --- 闂ㄥ簵绠＄悊 ---
app.get('/api/admin/stores', adminAuth, (_req, res) => {
  try { res.json(db.getAllStores()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/stores', adminAuth, (req, res) => {
  try {
    const r = db.addStore(req.body.name, req.body.webhook_url || '');
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/stores/:id', adminAuth, (req, res) => {
  try { db.updateStore(Number(req.params.id), req.body.name); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/stores/:id/toggle', adminAuth, (req, res) => {
  try { db.toggleStore(Number(req.params.id)); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/stores/:id', adminAuth, (req, res) => {
  try { db.deleteStore(Number(req.params.id)); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/stores/:id/webhook', adminAuth, (req, res) => {
  try { db.updateStoreWebhook(Number(req.params.id), req.body.webhook_url || ''); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/stores/:id/test-webhook', adminAuth, (req, res) => {
  try {
    const stores = db.getAllStores();
    const store = stores.find(s => s.id === Number(req.params.id));
    if (!store || !store.webhook_url) return res.status(400).json({ error: '璇ラ棬搴楁湭閰嶇疆 Webhook 鍦板潃' });

    const https = require('https');
    const url = new URL(store.webhook_url);
    const payload = JSON.stringify({
      msgtype: 'text',
      text: { content: `馃И 娴嬭瘯娑堟伅\n闂ㄥ簵锛?{store.name}\n鑿滃搧鎶ユ崯绯荤粺 Webhook 閰嶇疆姝ｅ父锛乣 }
    });

    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };

    const hreq = https.request(opts, (hres) => {
      let body = '';
      hres.on('data', d => body += d);
      hres.on('end', () => {
        try {
          const r = JSON.parse(body);
          if (r.errcode === 0) res.json({ success: true, message: '鍙戦€佹垚鍔? });
          else res.json({ success: false, error: r.errmsg || body });
        } catch (_) { res.json({ success: false, error: body }); }
      });
    });
    hreq.on('error', e => res.status(500).json({ error: e.message }));
    hreq.write(payload);
    hreq.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 鑿滃搧绠＄悊 ---
app.get('/api/admin/dishes', adminAuth, (_req, res) => {
  try { res.json(db.getAllDishes()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/dishes', adminAuth, (req, res) => {
  try { const r = db.addDish(req.body.name); res.json({ success: true, id: r.lastInsertRowid }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/dishes/:id', adminAuth, (req, res) => {
  try { db.updateDish(Number(req.params.id), req.body.name); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/dishes/:id/toggle', adminAuth, (req, res) => {
  try { db.toggleDish(Number(req.params.id)); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/dishes/:id', adminAuth, (req, res) => {
  try { db.deleteDish(Number(req.params.id)); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 浠婃棩姹囨€?---
app.get('/api/admin/summary', adminAuth, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    res.json({ date, ...db.getTodaySummary(date) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/report-text', adminAuth, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const summary = db.getTodaySummary(date);
    const d = new Date(date + 'T00:00:00+08:00');
    const month = d.getMonth() + 1, day = d.getDate();

    let text = `馃搵 浠婃棩鑿滃搧鎶ユ崯姹囨€伙紙${month}鏈?{day}鏃ワ級\n`;
    text += `鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣\n`;
    text += `鉁?宸叉彁浜わ紙${summary.submitted.length}瀹讹級锛歚;
    text += summary.submitted.length > 0 ? summary.submitted.map(s => s.store_name).join('銆?) : '鏃?;
    text += `\n鉂?鏈彁浜わ紙${summary.notSubmitted.length}瀹讹級锛歚;
    text += summary.notSubmitted.length > 0 ? summary.notSubmitted.map(s => s.name).join('銆?) : '鏃?;
    if (summary.notSubmitted.length > 0) text += '锛堣灏藉揩琛ヤ氦锛?;

    res.json({ text });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 瀹氭椂鎻愰啋妫€鏌ワ紙缁欏閮?cron 鏈嶅姟璋冪敤锛?---
app.get('/api/cron/check-reminder', (req, res) => {
  try {
    if (req.query.token !== ADMIN_PASSWORD) return res.status(401).json({ error: 'token 閿欒' });
    const date = new Date().toISOString().split('T')[0];
    const summary = db.getTodaySummary(date);
    res.json({
      date,
      totalStores: summary.allStores.length,
      submittedCount: summary.submitted.length,
      notSubmittedCount: summary.notSubmitted.length,
      notSubmittedStores: summary.notSubmitted.map(s => s.name),
      needsReminder: summary.notSubmitted.length > 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================== 鍚姩 ==================

db.initDb();
app.listen(PORT, () => {
  console.log('========================================');
  console.log('  馃嵔  椁愬巺姣忔棩鑿滃搧鎶ユ崯绯荤粺');
  console.log('========================================');
  console.log(`  濉姤椤甸潰 : http://localhost:${PORT}/`);
  console.log(`  绠＄悊鍚庡彴 : http://localhost:${PORT}/admin.html`);
  console.log(`  绠＄悊瀵嗙爜 : ${ADMIN_PASSWORD}`);
  console.log('========================================');
});
