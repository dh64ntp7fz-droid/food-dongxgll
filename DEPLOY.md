# 鍏嶈垂閮ㄧ讲鍒?AlwaysData

鍏嶈垂浜戝钩鍙?**AlwaysData**锛堟硶鍥斤級锛屾棤闇€淇＄敤鍗★紝鑷甫 100MB 瀛樺偍 + Node.js 鏀寔锛屽畬缇庤繍琛屾垜浠殑 SQLite 搴旂敤銆?
## 绗竴姝ワ細娉ㄥ唽璐﹀彿锛? 鍒嗛挓锛?
1. 鎵撳紑 https://www.alwaysdata.com/en/register/
2. 濉偖绠?+ 瀵嗙爜 鈫?鐐瑰嚮 "Create my account"
3. 鍘婚偖绠辩偣纭閾炬帴
4. 鐧诲綍鍚庣湅鍒版帶鍒堕潰鏉?
## 绗簩姝ワ細鍒涘缓 Node.js 搴旂敤锛? 鍒嗛挓锛?
1. 宸︿晶鑿滃崟 鈫?**Web** 鈫?**Sites**
2. 鐐圭豢鑹?**Add a site** 鎸夐挳
3. 濉啓锛?   - **Name**: `food-waste`锛堥殢渚胯捣锛?   - **Addresses**: 鐢ㄩ粯璁ょ粰浣犵殑鍩熷悕锛堝 `xxx.alwaysdata.net`锛?   - **Type**: 閫?**Node.js**
   - **Node.js version**: 閫?**22**
   - **Application directory**: `/home/浣犵殑鐢ㄦ埛鍚?food-waste`
   - **Working directory**: `/home/浣犵殑鐢ㄦ埛鍚?food-waste`
   - **Environment**: 
     ```
     PORT=8100
     ADMIN_PASSWORD=浣犵殑瀵嗙爜
     DB_PATH=/home/浣犵殑鐢ㄦ埛鍚?food-waste/data/food-waste.db
     ```
   - **Command**: `node server.js`
4. 鐐?**Submit** 鍒涘缓

## 绗笁姝ワ細涓婁紶鏂囦欢锛? 鍒嗛挓锛?
鍦ㄦ帶鍒堕潰鏉垮乏渚?鈫?**Files**锛岃繘鍏?`/home/浣犵殑鐢ㄦ埛鍚?` 鐩綍锛?
1. 鍒涘缓鏂囦欢澶?`food-waste`
2. 杩涘叆 `food-waste`锛屼笂浼犺繖浜涙枃浠讹細
   - `package.json`
   - `server.js`  
   - `database.js`
3. 鍒涘缓鏂囦欢澶?`public`
4. 杩涘叆 `public`锛屼笂浼狅細
   - `index.html`
   - `admin.html`

## 绗洓姝ワ細瀹夎渚濊禆锛? 鍒嗛挓锛?
1. 宸︿晶鑿滃崟 鈫?**Advanced** 鈫?**SSH** 鈫?寮€鍚?SSH 璁块棶
2. 鐢ㄧ粓绔繛鎺ワ紙鎴栫洿鎺ョ敤 AlwaysData 鐨?Web SSH锛夛細
   ```bash
   ssh 浣犵殑鐢ㄦ埛鍚岪ssh-alwaysdata.net
   cd food-waste
   npm install
   ```

## 绗簲姝ワ細閲嶅惎鏈嶅姟

鍥炲埌 **Web 鈫?Sites**锛岀偣 `food-waste` 鍙宠竟鐨?**Restart** 鎸夐挳銆?
绛?10 绉掞紝鎵撳紑浣犵殑鍩熷悕锛堝 `https://xxx.alwaysdata.net`锛夛紝濉姤椤甸潰灏卞嚭鏉ヤ簡锛?
---

## 娉ㄦ剰浜嬮」

- 鈿狅笍 鍏嶈垂濂楅 100MB锛屾垜浠殑搴旂敤绾?20MB锛屽鐢?- 鈿狅笍 濡傛灉鎻愮ず SSL 璇佷功閿欒锛岀瓑 5 鍒嗛挓鑷姩绛惧彂
- 鈿狅笍 绠＄悊瀵嗙爜璁板緱鏀规垚澶嶆潅鐨勶紝鍦?Environment 閲屾敼 `ADMIN_PASSWORD`

## 瀹屾垚鍚庣殑 URL

- 鍘ㄥ笀闀垮～鎶ワ細`https://浣犵殑鍩熷悕.alwaysdata.net`
- 绠＄悊鍚庡彴锛歚https://浣犵殑鍩熷悕.alwaysdata.net/admin.html`
- 瀵嗙爜锛氫綘璁剧疆鐨?`ADMIN_PASSWORD`
