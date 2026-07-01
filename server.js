const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./database');

// 加载 .env
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

// ================== 管理后台认证 ==================
function adminAuth(req, res, next) {
  if (req.headers['x-admin-token'] === ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: '未授权，请先登录' });
}

// ================== 厨师长端 API ==================

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
      return res.status(400).json({ error: '缺少必要参数：storeId, date, items' });
    }
    db.submitReport(storeId, storeName, date, JSON.stringify(items), submitTime);
    res.json({ success: true, message: '提交成功！' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================== 管理后台 API ==================

app.post('/api/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) return res.json({ success: true, token: ADMIN_PASSWORD });
  return res.status(401).json({ error: '密码错误' });
});

app.post('/api/admin/verify', adminAuth, (_req, res) => res.json({ success: true }));

// --- 门店管理 ---
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
    if (!store || !store.webhook_url) return res.status(400).json({ error: '该门店未配置 Webhook 地址' });

    const https = require('https');
    const url = new URL(store.webhook_url);
    const payload = JSON.stringify({
      msgtype: 'text',
      text: { content: '** 测试消息\n门店：' + store.name + '\n菜品报损系统 Webhook 配置正常！' }
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
          if (r.errcode === 0) res.json({ success: true, message: '发送成功' });
          else res.json({ success: false, error: r.errmsg || body });
        } catch (_) { res.json({ success: false, error: body }); }
      });
    });
    hreq.on('error', e => res.status(500).json({ error: e.message }));
    hreq.write(payload);
    hreq.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 菜品管理 ---
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

// --- 今日汇总---
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

    let text = `=== 今日菜品报损汇总（${month}月${day}日）\n`;
    text += `────────────────────\n`;
    text += `✅ 已提交（${summary.submitted.length}家）：`;
    text += summary.submitted.length > 0 ? summary.submitted.map(s => s.store_name).join('、') : '无';
    text += `\n❌ 未提交（${summary.notSubmitted.length}家）：`;
    text += summary.notSubmitted.length > 0 ? summary.notSubmitted.map(s => s.name).join('、') : '无';
    if (summary.notSubmitted.length > 0) text += '（请尽快补交）';

    res.json({ text });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 定时提醒检查（给外部 cron 服务调用）---
app.get('/api/cron/check-reminder', (req, res) => {
  try {
    if (req.query.token !== ADMIN_PASSWORD) return res.status(401).json({ error: 'token 错误' });
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

// ================== 启动 ==================

db.initDb();
app.listen(PORT, () => {
  console.log('========================================');
  console.log('  餐厅每日菜品报损系统');
  console.log('========================================');
  console.log(`  填报页面 : http://localhost:${PORT}/`);
  console.log(`  管理后台 : http://localhost:${PORT}/admin.html`);
  console.log(`  管理密码 : ${ADMIN_PASSWORD}`);
  console.log('========================================');
});
