const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'food-waste.db'));

// 娓呯┖闂ㄥ簵琛?db.exec('DELETE FROM stores');
db.exec("DELETE FROM sqlite_sequence WHERE name='stores'");

// 7瀹剁湡瀹為棬搴?const stores = [
  '\u7eff\u5c9b\u82b1\u56ed\u5e97',   // 缁垮矝鑺卞洯搴?  '\u77f3\u5ca9\u4e3b\u573a\u5e97',   // 鐭冲博涓诲満搴?  '\u5927\u6717\u7280\u725b\u5761\u5e97', // 澶ф湕鐘€鐗涘潯搴?  '\u6a2a\u5c97\u5e97',               // 妯矖搴?  '\u7eff\u8377/\u80b2\u513f\u5e97',   // 缁胯嵎/鑲插効搴?  '\u79d1\u82d1\u5e97',               // 绉戣嫅搴?  '\u4f53\u80b2\u9986\u5e97'          // 浣撹偛棣嗗簵
];

const insert = db.prepare('INSERT INTO stores (name, sort_order) VALUES (?, ?)');
const tx = db.transaction(() => {
  stores.forEach((name, i) => insert.run(name, i));
});
tx();

// 楠岃瘉
const all = db.prepare('SELECT * FROM stores ORDER BY sort_order').all();
console.log('=== DONE ===');
all.forEach(s => console.log(s.id + '. ' + s.name));
console.log('Total: ' + all.length);

db.close();
