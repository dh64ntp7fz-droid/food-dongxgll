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

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ================== 企业微信消息发送 ==================

/** 向指定 Webhook 发送消息 */
function sendWecomMsg(webhookUrl, content) {
  return new Promise((resolve) => {
    try {
      const https = require('https');
      const url = new URL(webhookUrl);
      const payload = JSON.stringify({
        msgtype: 'text',
        text: { content }
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
          try { const r = JSON.parse(body); resolve(r.errcode === 0); }
          catch (_) { resolve(false); }
        });
      });
      hreq.on('error', () => resolve(false));
      hreq.write(payload);
      hreq.end();
    } catch (_) { resolve(false); }
  });
}

/** 获取全局 Webhook 地址 */
function getWebhookUrl() {
  return db.getSetting('webhook_url');
}

/** 向全局 Webhook 发送群消息 */
async function broadcastToAll(msg) {
  const wh = getWebhookUrl();
  if (!wh) return 0;
  const ok = await sendWecomMsg(wh, msg);
  return ok ? 1 : 0;
}

// ================== 定时任务（服务器内部自检） ==================

const CHINA_TZ = 'Asia/Shanghai';

/** 获取中国当前时间和日期 */
function chinaNow() {
  const now = new Date();
  const cn = new Date(now.toLocaleString('en-US', { timeZone: CHINA_TZ }));
  return { date: cn.toISOString().split('T')[0], hour: cn.getHours(), min: cn.getMinutes() };
}

/** 获取当前日期的汇总文案 */
function buildSummary() {
  const { date } = chinaNow();
  const summary = db.getTodaySummary(date);
  const d = new Date(date + 'T00:00:00+08:00');
  const month = d.getMonth() + 1, day = d.getDate();
  let text = `📊 不能隔夜菜品上报汇总（${month}月${day}日）\n\n`;
  text += `✅ 已填报（${summary.submitted.length}家）：`;
  text += summary.submitted.length > 0 ? summary.submitted.map(s => s.store_name).join('、') : '无';
  text += `\n❌ 未填报（${summary.notSubmitted.length}家）：`;
  text += summary.notSubmitted.length > 0 ? summary.notSubmitted.map(s => s.name).join('、') : '无';
  if (summary.notSubmitted.length > 0) text += '\n\n⚠️ 请尽快补交！';
  return text;
}

/** 19:45 提醒消息 */
function buildReminder() {
  const { date } = chinaNow();
  const summary = db.getTodaySummary(date);
  let text = `🍳 不能隔夜菜品系统已上线\n\n`;
  text += `各位厨师长好！从今天起，请每天20:00前在此群填报不能隔夜菜品的剩余数量。\n\n`;
  text += `⏰ 每日19:30自动提醒\n📊 每日20:15自动汇总\n🚨 未填报的门店将被列出\n\n`;
  text += `───────────\n`;
  text += `📋 当前填报进度\n\n`;
  text += `✅ 已填报（${summary.submitted.length}家）：`;
  text += summary.submitted.length > 0 ? summary.submitted.map(s => s.store_name).join('、') : '暂无';
  text += `\n❌ 未填报（${summary.notSubmitted.length}家）：`;
  text += summary.notSubmitted.length > 0 ? summary.notSubmitted.map(s => s.name).join('、') : '全部已填报 🎉';
  if (summary.notSubmitted.length > 0) text += '\n\n⚠️ 请以上门店厨师长尽快填报！';
  return text;
}

/** 检查是否需要发送定时消息（每分钟调用） */
async function scheduledCheck() {
  const { date, hour, min } = chinaNow();
  const todayKey = date;

  // 19:45 → 发送提醒（带当前进度）
  if (hour === 19 && min === 45) {
    const sentKey = 'sent_reminder_' + todayKey;
    if (global[sentKey]) return; // 今天已发过
    global[sentKey] = true;

    const msg = buildReminder();
    const n = await broadcastToAll(msg);
    console.log(`[CRON] 19:45 提醒已发送至 ${n} 个群`);
    return;
  }

  // 20:15 → 发送最终汇总
  if (hour === 20 && min === 15) {
    const sentKey = 'sent_summary_' + todayKey;
    if (global[sentKey]) return;
    global[sentKey] = true;

    const msg = buildSummary();
    const n = await broadcastToAll(msg);
    console.log(`[CRON] 20:15 汇总已发送至 ${n} 个群`);
    return;
  }
}

// 每分钟检查一次
setInterval(scheduledCheck, 60000);

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

// ================== 管理后台 API（无密码） ==================

// --- 门店管理 ---
app.get('/api/admin/stores', (_req, res) => {
  try { res.json(db.getAllStores()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/stores', (req, res) => {
  try {
    const r = db.addStore(req.body.name);
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/stores/:id', (req, res) => {
  try { db.updateStore(Number(req.params.id), req.body.name); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/stores/:id/toggle', (req, res) => {
  try { db.toggleStore(Number(req.params.id)); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/stores/:id', (req, res) => {
  try { db.deleteStore(Number(req.params.id)); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 全局设置（Webhook） ---
app.get('/api/admin/settings/webhook', (req, res) => {
  try { res.json({ webhook_url: db.getSetting('webhook_url') || '' }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/settings/webhook', (req, res) => {
  try {
    db.setSetting('webhook_url', req.body.webhook_url || '');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/settings/test-webhook', async (req, res) => {
  try {
    const wh = db.getSetting('webhook_url');
    if (!wh) return res.status(400).json({ error: '未配置 Webhook 地址' });
    const ok = await sendWecomMsg(wh, '** 测试消息\n不能隔夜菜品上报系统 Webhook 配置正常！');
    res.json({ success: ok, message: ok ? '发送成功' : '发送失败' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 菜品管理 ---
app.get('/api/admin/dishes', (_req, res) => {
  try { res.json(db.getAllDishes()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/dishes', (req, res) => {
  try { const r = db.addDish(req.body.name); res.json({ success: true, id: r.lastInsertRowid }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/dishes/:id', (req, res) => {
  try { db.updateDish(Number(req.params.id), req.body.name); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/dishes/:id/toggle', (req, res) => {
  try { db.toggleDish(Number(req.params.id)); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/dishes/:id', (req, res) => {
  try { db.deleteDish(Number(req.params.id)); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 今日汇总---
app.get('/api/admin/summary', (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    res.json({ date, ...db.getTodaySummary(date) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/report-text', (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const summary = db.getTodaySummary(date);
    const d = new Date(date + 'T00:00:00+08:00');
    const month = d.getMonth() + 1, day = d.getDate();

    let text = `=== 今日不能隔夜菜品上报汇总（${month}月${day}日）\n`;
    text += `────────────────────\n`;
    text += `✅ 已提交（${summary.submitted.length}家）：`;
    text += summary.submitted.length > 0 ? summary.submitted.map(s => s.store_name).join('、') : '无';
    text += `\n❌ 未提交（${summary.notSubmitted.length}家）：`;
    text += summary.notSubmitted.length > 0 ? summary.notSubmitted.map(s => s.name).join('、') : '无';
    if (summary.notSubmitted.length > 0) text += '（请尽快补交）';

    res.json({ text });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 定时任务对外接口（给 cron-job.org 等外部服务调用）---
// 使用方法：在 cron-job.org 设置每天 19:45 和 20:15 调用此接口
// 接口地址：https://food-dongxgll.onrender.com/api/cron/trigger?type=reminder
//            https://food-dongxgll.onrender.com/api/cron/trigger?type=summary

app.get('/api/cron/trigger', async (req, res) => {
  try {
    const type = req.query.type || 'reminder';
    const { date } = chinaNow();
    const sentKey = 'sent_' + type + '_' + date;

    // 避免同一天重复发送
    if (global[sentKey]) {
      return res.json({ success: true, message: '今日已发送过，跳过' });
    }
    global[sentKey] = true;

    let msg, label;
    if (type === 'summary') {
      msg = buildSummary();
      label = '20:15 汇总';
    } else {
      msg = buildReminder();
      label = '19:45 提醒';
    }

    const n = await broadcastToAll(msg);
    res.json({ success: true, message: label + '已发送至 ' + n + ' 个群', sentCount: n });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 查询当天填报状态
app.get('/api/cron/status', (req, res) => {
  try {
    const { date } = chinaNow();
    const summary = db.getTodaySummary(date);
    res.json({
      date,
      submitted: summary.submitted.map(s => s.store_name),
      notSubmitted: summary.notSubmitted.map(s => s.name),
      totalStores: summary.allStores.length,
      submittedCount: summary.submitted.length,
      notSubmittedCount: summary.notSubmitted.length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================== 启动 ==================

db.initDb();
app.listen(PORT, () => {
  console.log('========================================');
  console.log('  餐厅每日不能隔夜菜品上报系统');
  console.log('========================================');
  console.log(`  填报页面 : http://localhost:${PORT}/`);
  console.log('========================================');
});
