const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./database');

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

function sendWecomMsg(webhookUrl, content) {
  return new Promise(resolve => {
    try {
      const https = require('https');
      const url = new URL(webhookUrl);
      const payload = JSON.stringify({ msgtype: 'text', text: { content } });
      const opts = {
        hostname: url.hostname, path: url.pathname + url.search, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      };
      const hreq = https.request(opts, hres => {
        let body = '';
        hres.on('data', d => body += d);
        hres.on('end', () => {
          try { const r = JSON.parse(body); resolve(r.errcode === 0); } catch (_) { resolve(false); }
        });
      });
      hreq.on('error', () => resolve(false));
      hreq.write(payload);
      hreq.end();
    } catch (_) { resolve(false); }
  });
}

/** 按区域群发：向每个有 Webhook 的区域发送消息 */
function broadcastToRegions(msgBuilder) {
  const regions = db.getAllRegions();
  let sent = 0;
  for (const r of regions) {
    if (!r.webhook_url) continue;
    const msg = msgBuilder(r);
    const ok = sendWecomMsg(r.webhook_url, msg);
    if (ok) sent++;
  }
  console.log(`[群发] 已发送至 ${sent}/${regions.filter(r => r.webhook_url).length} 个区域群`);
  return sent;
}

// ================== 定时任务 ==================

const CHINA_TZ = 'Asia/Shanghai';

function chinaNow() {
  const now = new Date();
  const cn = new Date(now.toLocaleString('en-US', { timeZone: CHINA_TZ }));
  return { date: cn.toISOString().split('T')[0], hour: cn.getHours(), min: cn.getMinutes() };
}

function buildReminderForRegion(region) {
  const { date } = chinaNow();
  const summary = db.getTodaySummaryByRegion(date, region.id);
  let text = `🍳 不能隔夜菜品系统已上线\n\n`;
  text += `【${region.name}】各位厨师长好！请每天20:00前在此群填报不能隔夜菜品的剩余数量。\n\n`;
  text += `⏰ 每日19:30自动提醒\n📊 每日20:15自动汇总\n🚨 未填报的门店将被列出\n\n`;
  text += `───────────\n📋 当前填报进度\n\n`;
  text += `✅ 已填报（${summary.submitted.length}家）：`;
  text += summary.submitted.length > 0 ? summary.submitted.map(s => s.store_name).join('、') : '暂无';
  text += `\n❌ 未填报（${summary.notSubmitted.length}家）：`;
  text += summary.notSubmitted.length > 0 ? summary.notSubmitted.map(s => s.name).join('、') : '全部已填报 🎉';
  if (summary.notSubmitted.length > 0) text += '\n\n⚠️ 请尽快填报！';
  return text;
}

function buildSummaryForRegion(region) {
  const { date } = chinaNow();
  const summary = db.getTodaySummaryByRegion(date, region.id);
  const d = new Date(date + 'T00:00:00+08:00');
  const month = d.getMonth() + 1, day = d.getDate();
  let text = `📊 不能隔夜菜品上报汇总（${month}月${day}日）\n【${region.name}】\n\n`;
  text += `✅ 已填报（${summary.submitted.length}家）：`;
  text += summary.submitted.length > 0 ? summary.submitted.map(s => s.store_name).join('、') : '无';
  text += `\n❌ 未填报（${summary.notSubmitted.length}家）：`;
  text += summary.notSubmitted.length > 0 ? summary.notSubmitted.map(s => s.name).join('、') : '无';
  if (summary.notSubmitted.length > 0) text += '\n\n⚠️ 请尽快补交！';
  return text;
}

function scheduledCheck() {
  const { date, hour, min } = chinaNow();

  if (hour === 19 && min === 45) {
    if (global['sent_reminder_' + date]) return;
    global['sent_reminder_' + date] = true;
    broadcastToRegions(buildReminderForRegion);
    return;
  }

  if (hour === 20 && min === 15) {
    if (global['sent_summary_' + date]) return;
    global['sent_summary_' + date] = true;
    broadcastToRegions(buildSummaryForRegion);
    return;
  }
}

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
    const { storeId, regionId, storeName, date, items, submitTime } = req.body;
    if (!storeId || !date || !items || items.length === 0) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    db.submitReport(storeId, regionId || 0, storeName, date, JSON.stringify(items), submitTime);
    // 按区域发提交通知
    const region = db.getAllRegions().find(r => r.id === (regionId || 0));
    if (region && region.webhook_url) {
      let msg = '✅ ' + storeName + ' 已提交\n───────────\n';
      items.forEach(i => { if (i.quantity) msg += i.dish_name + '：' + i.quantity + '份\n'; });
      const total = items.reduce((s, i) => s + (i.quantity || 0), 0);
      msg += '───────────\n剩余共' + total + '份';
      sendWecomMsg(region.webhook_url, msg);
    }
    res.json({ success: true, message: '提交成功！' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================== 管理后台 API ==================

// --- 区域管理 ---
app.get('/api/admin/regions', (_req, res) => {
  try { res.json(db.getAllRegions()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/regions', (req, res) => {
  try { const r = db.addRegion(req.body.name, req.body.webhook_url); res.json({ success: true, id: r.lastInsertRowid }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/regions/:id', (req, res) => {
  try { db.updateRegion(Number(req.params.id), req.body.name, req.body.webhook_url); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/regions/:id/test-webhook', (req, res) => {
  try {
    const regions = db.getAllRegions();
    const r = regions.find(x => x.id === Number(req.params.id));
    if (!r || !r.webhook_url) return res.status(400).json({ error: '未配置 Webhook' });
    const ok = sendWecomMsg(r.webhook_url, '** 测试消息\n【' + r.name + '】Webhook 配置正常！');
    res.json({ success: ok, message: ok ? '发送成功' : '发送失败' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/regions/:id', (req, res) => {
  try { db.deleteRegion(Number(req.params.id)); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 门店管理 ---
app.get('/api/admin/stores', (_req, res) => {
  try { res.json(db.getAllStores()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/stores', (req, res) => {
  try { const r = db.addStore(req.body.name, req.body.region_id); res.json({ success: true, id: r.lastInsertRowid }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/stores/:id', (req, res) => {
  try { db.updateStore(Number(req.params.id), req.body.name); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/stores/:id/region', (req, res) => {
  try { db.updateStoreRegion(Number(req.params.id), Number(req.body.region_id)); res.json({ success: true }); }
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

// --- 菜品管理 ---
app.get('/api/admin/dishes', (_req, res) => {
  try { res.json(db.getAllDishes()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/dishes', (req, res) => {
  try { const r = db.addDish(req.body.name, req.body.dish_group); res.json({ success: true, id: r.lastInsertRowid }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/dishes/:id', (req, res) => {
  try { db.updateDish(Number(req.params.id), req.body.name, req.body.dish_group); res.json({ success: true }); }
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

// --- 定时任务对外接口 ---
app.get('/api/cron/trigger', (req, res) => {
  try {
    const type = req.query.type || 'reminder';
    const { date } = chinaNow();
    const key = 'sent_' + type + '_' + date;
    if (global[key]) return res.json({ success: true, message: '今日已发送过，跳过' });
    global[key] = true;

    const msgBuilder = type === 'summary' ? buildSummaryForRegion : buildReminderForRegion;
    const sent = broadcastToRegions(msgBuilder);
    res.json({ success: true, message: '已发送至 ' + sent + ' 个区域群', sentCount: sent });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/cron/status', (req, res) => {
  try {
    const { date } = chinaNow();
    const regions = db.getAllRegions();
    const data = [];
    for (const r of regions) {
      const summary = db.getTodaySummaryByRegion(date, r.id);
      data.push({
        region: r.name,
        webhook: r.webhook_url ? '已配置' : '未配置',
        submitted: summary.submitted.map(s => s.store_name),
        notSubmitted: summary.notSubmitted.map(s => s.name),
        totalStores: summary.allStores.length,
        submittedCount: summary.submitted.length,
        notSubmittedCount: summary.notSubmitted.length,
      });
    }
    res.json({ date, regions: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================== 启动 ==================

(async () => {
  try {
    db.initDb();
  } catch (e) {
    console.error('[启动] 数据库初始化失败:', e.message);
  }
  app.listen(PORT, () => {
    console.log('========================================');
    console.log('  不能隔夜菜品上报系统');
    console.log('========================================');
    console.log(`  填报页面 : http://localhost:${PORT}/`);
    console.log('========================================');
  });
})();
