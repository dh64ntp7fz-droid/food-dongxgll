# 馃嵔锔?椁愬巺姣忔棩鑿滃搧鎶ユ崯绯荤粺

鍗曢〉搴旂敤锛屽墠鍚庣涓€浣擄紝SQLite 瀛樺偍锛岄浂閰嶇疆鍚姩銆?
## 蹇€熷紑濮?
### 1. 瀹夎渚濊禆锛堜粎棣栨锛?
```bash
cd food-waste-app
npm install
```

### 2. 鍚姩鏈嶅姟

```bash
npm start
```

### 3. 鎵撳紑椤甸潰

| 椤甸潰 | 鍦板潃 | 鐢ㄩ€?|
|------|------|------|
| 濉姤绔?| `http://localhost:3000` | 鍘ㄥ笀闀垮～鎶ワ紙缁欓棬搴楃敤锛?|
| 绠＄悊绔?| `http://localhost:3000/admin.html` | 鍚庡彴绠＄悊锛堜綘鑷繁鐢級 |

榛樿绠＄悊瀵嗙爜锛歚admin123`锛堝彲鍦?`.env` 鏂囦欢涓慨鏀?`ADMIN_PASSWORD`锛?
## 淇敼閰嶇疆

### 淇敼绠＄悊瀵嗙爜

缂栬緫 `.env` 鏂囦欢锛屼慨鏀?`ADMIN_PASSWORD=浣犵殑瀵嗙爜`锛岀劧鍚庨噸鍚湇鍔°€?
### 淇敼鑿滃搧鍒楄〃 & 闂ㄥ簵鍒楄〃

閫氳繃绠＄悊鍚庡彴 `admin.html` 鐩存帴澧炲垹鏀癸紝**鍗虫椂鐢熸晥**锛屽帹甯堥暱鍒锋柊椤甸潰灏辫兘鐪嬪埌銆?
鎴栬€呯洿鎺ョ紪杈?`database.js` 涓殑 `seedDefaults()` 鍑芥暟閲岀殑榛樿鍒楄〃锛?*鍒犻櫎 `data/food-waste.db` 鏂囦欢鍚庨噸鍚?*鍗冲彲閲嶆柊鍒濆鍖栥€?
## 瀹氭椂鎻愰啋閰嶇疆锛?9:50 鑷姩妫€鏌ワ級

棰勭暀浜嗘鏌ユ帴鍙ｏ紝鍙厤鍚堢郴缁熷畾鏃朵换鍔′娇鐢細

### Windows 浠诲姟璁″垝绋嬪簭

```powershell
# 鍒涘缓姣忓ぉ 19:50 鎵ц鐨勪换鍔?schtasks /create /tn "鑿滃搧鎶ユ崯鎻愰啋" /tr "curl http://localhost:3000/api/cron/check-reminder?token=admin123" /sc daily /st 19:50
```

### Linux / macOS cron

```bash
# 缂栬緫 crontab
crontab -e

# 娣诲姞涓€琛岋細姣忓ぉ 19:50 璋冪敤
50 19 * * * curl "http://localhost:3000/api/cron/check-reminder?token=浣犵殑瀵嗙爜"
```

杩斿洖绀轰緥锛?```json
{
  "date": "2026-07-01",
  "totalStores": 10,
  "submittedCount": 7,
  "notSubmittedCount": 3,
  "notSubmittedStores": ["浜屽垎搴?, "浜斿垎搴?, "鍏垎搴?],
  "needsReminder": true
}
```

浣犲彲浠ュ熀浜庤繖涓帴鍙ｅ啓涓€涓剼鏈紝褰?`needsReminder` 涓?true 鏃惰嚜鍔ㄥ彂浼佷笟寰俊娑堟伅銆?
## 鎶€鏈灦鏋?
```
food-waste-app/
鈹溾攢鈹€ server.js         # Express 鏈嶅姟 & API 璺敱
鈹溾攢鈹€ database.js       # SQLite 鏁版嵁搴撴搷浣滃眰
鈹溾攢鈹€ package.json
鈹溾攢鈹€ .env              # 閰嶇疆锛堝瘑鐮併€佺鍙ｏ級
鈹溾攢鈹€ public/
鈹?  鈹溾攢鈹€ index.html    # 鍘ㄥ笀闀垮～鎶ラ〉闈?鈹?  鈹斺攢鈹€ admin.html    # 绠＄悊鍚庡彴
鈹斺攢鈹€ data/
    鈹斺攢鈹€ food-waste.db # SQLite 鏁版嵁搴撴枃浠讹紙鑷姩鍒涘缓锛?```

## 绔彛淇敼

缂栬緫 `.env` 鏂囦欢锛屼慨鏀?`PORT=8080`锛堟垨鍏朵粬绔彛锛夛紝閲嶅惎鏈嶅姟銆?
## 鏁版嵁澶囦唤

瀹氭湡澶囦唤 `data/food-waste.db` 鏂囦欢鍗冲彲锛岃繖灏辨槸鍏ㄩ儴鏁版嵁銆?