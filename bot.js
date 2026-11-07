"use strict";
/*
 * רדאר איתותים — בוט טלגרם
 * סורק את הנכסים, שולח איתות חדש לטלגרם, ומדווח כשעסקה הגיעה ליעד או לסטופ.
 *   node bot.js          ריצה אחת (מתאים ל-GitHub Actions כל 5 דקות)
 *   node bot.js --loop   ריצה רציפה (מחשב / Render / Railway / VPS)
 * משתני סביבה: BOT_TOKEN (חובה), CHAT_ID (רשות — אחרת נלמד אוטומטית כששולחים /start לבוט)
 */
const fs = require("fs");
const path = require("path");
const E = require("./engine");

const DIR = __dirname;
const CFG = JSON.parse(fs.readFileSync(path.join(DIR, "config.json"), "utf8"));
const STATE_FILE = path.join(DIR, "state.json");
const TOKEN = (process.env.BOT_TOKEN || "").trim();
const LOOP = process.argv.includes("--loop");

let state = {};
try { state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch (e) { state = {}; }
state.offset = state.offset || 0;
state.chats = state.chats || [];
state.sent = state.sent || [];
state.open = state.open || [];
state.perf = state.perf || { n: 0, wins: 0, R: 0 };
if (process.env.CHAT_ID) for (const id of process.env.CHAT_ID.split(",").map(s => s.trim()).filter(Boolean)) if (!state.chats.includes(id)) state.chats.push(id);
let dirty = false;
const save = () => { if (!dirty) return; state.sent = state.sent.slice(-400); fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n"); dirty = false; };

/* ---------- Telegram ---------- */
async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {})
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description || r.status}`);
  return j.result;
}
async function sendAll(html) {
  if (!state.chats.length) { console.log("[no chat yet] " + html.replace(/<[^>]+>/g, "")); return; }
  for (const chat of state.chats) {
    try { await tg("sendMessage", { chat_id: chat, text: html, parse_mode: "HTML", disable_web_page_preview: true }); }
    catch (e) {
      console.error(e.message);
      if (/blocked|chat not found|kicked/i.test(e.message)) { state.chats = state.chats.filter(c => c !== chat); dirty = true; }
    }
  }
}
const send = (chat, html) => tg("sendMessage", { chat_id: chat, text: html, parse_mode: "HTML", disable_web_page_preview: true }).catch(e => console.error(e.message));

/* ---------- Formatting ---------- */
const fp = x => { if (!Number.isFinite(x)) return "–"; const d = x >= 10 ? 2 : 4; return x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); };
const fR = x => Number.isFinite(x) ? (x > 0 ? "+" : "") + x.toFixed(2) + "R" : "–";
const pct = x => Number.isFinite(x) ? Math.round(x * 100) + "%" : "–";
const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const tfL = tf => E.TF[tf].l;
const regimeHe = { trend: "שוק במגמה", range: "שוק מדשדש", mixed: "שוק במעבר", extreme: "תנודתיות קיצונית" };
const partHe = { trend: "ממוצעים", htf: "טווח גבוה", macd: "MACD", rsi: "RSI", vwap: "VWAP", vol: "נפח", sqz: "כיווץ" };
const asset = sym => E.ASSETS.find(a => a.s === sym) || { k: sym, n: sym };
const params = (sym, tf) => ({ ...E.DEF, ...(CFG.params || {}), ...((CFG.overrides || {})[`${sym}|${tf}`] || {}) });
const footer = () => (CFG.siteUrl ? `\n<a href="${esc(CFG.siteUrl)}">פתח את הרדאר</a> · ` : "\n") + "<i>לא ייעוץ השקעות</i>";

/* ---------- Data ---------- */
async function analyze(sym, tf) {
  const [l, h] = await Promise.all([E.fetchK(sym, tf, E.LIMIT), E.fetchK(sym, E.TF[tf].htf, E.LIMIT)]);
  const D = E.build({ l, h }, tf);
  const P = params(sym, tf);
  const trades = E.backtest(D, P);
  return { D, P, trades };
}

/* ---------- Scan ---------- */
async function scan() {
  const now = Date.now();
  const rows = [];
  for (const sym of CFG.assets) for (const tf of CFG.timeframes) {
    let A;
    try { A = await analyze(sym, tf); } catch (e) { console.error(`${sym} ${tf}: ${e.message}`); continue; }
    const { D, P, trades } = A, a = asset(sym), key = `${sym}|${tf}`, ms = E.TF[tf].ms;
    rows.push({ sym, tf, ...A });

    // 1) results of signals we already sent
    for (const o of state.open.filter(o => o.key === key)) {
      const tr = trades.find(t => D.t[t.sig] === o.sigT);
      if (!tr) { if (o.sigT < D.t[0]) { state.open = state.open.filter(x => x !== o); dirty = true; } continue; }
      if (tr.out === "open") continue;
      state.open = state.open.filter(x => x !== o); dirty = true;
      state.perf.n++; state.perf.R += tr.R; if (tr.R > 0) state.perf.wins++;
      const icon = tr.out === "tp" ? "✅" : tr.out === "sl" ? "❌" : "⏱";
      const what = tr.out === "tp" ? "הגיע ליעד" : tr.out === "sl" ? "נעצר בסטופ" : "נסגר ביציאת זמן";
      await sendAll(`${icon} <b>${tr.dir > 0 ? "לונג" : "שורט"} ${a.k}</b> · ${tfL(tf)} ${what}: <b>${fR(tr.R)}</b>\n` +
        `מעקב חי מאז ההפעלה: ${state.perf.n} עסקאות · ${pct(state.perf.wins / state.perf.n)} הצלחה · סה״כ ${fR(state.perf.R)}`);
    }

    // 2) new signals on recently closed candles
    const last = D.n - 2;
    for (let j = Math.max(E.START + 1, last - (CFG.lookbackCandles || 3)); j <= last; j++) {
      const s = E.signalAt(D, j, P);
      if (!s || s === E.signalAt(D, j - 1, P)) continue;
      // only signals the backtest would actually take (no stacking while a trade is open)
      if (!trades.some(t => t.sig === j)) continue;
      const id = `${key}|${D.t[j]}`;
      if (state.sent.includes(id)) continue;
      state.sent.push(id); dirty = true;
      const closeT = D.t[j] + ms, ageMin = Math.round((now - closeT) / 6e4);
      if (ageMin > (CFG.maxAgeMinutes || 30)) continue;

      const dirTr = trades.filter(t => t.dir === s && D.t[t.sig] < D.t[j]);
      const st = E.stats(dirTr);
      if (CFG.onlyPositiveEdge && st.n >= (CFG.minHistoryTrades || 8) && st.exp <= 0) {
        console.log(`skip ${id}: negative history edge ${fR(st.exp)}`);
        continue;
      }
      const e = D.ev[j], entry = D.c[j], risk = P.sl * D.atr[j];
      const why = Object.keys(E.W).map(k => ({ k, pts: Math.round(E.W[k] * e.P[k]) }))
        .filter(x => Math.sign(x.pts) === s).sort((x, y) => Math.abs(y.pts) - Math.abs(x.pts)).slice(0, 3)
        .map(x => `• ${partHe[x.k]} (${x.pts > 0 ? "+" : ""}${x.pts}): ${esc(e.note[x.k])}`).join("\n");
      const hist = st.n ? `${st.n} איתותים דומים בעבר: <b>${pct(st.wr)}</b> הצלחה, תוחלת <b>${fR(st.exp)}</b>${st.n < (CFG.minHistoryTrades || 8) ? " (מעט נתונים)" : ""}` : "אין עדיין היסטוריה לאיתות כזה";
      await sendAll(
        `${s > 0 ? "🟢" : "🔴"} <b>${s > 0 ? "לונג" : "שורט"} ${a.k}</b> · ${tfL(tf)}${ageMin > ms / 6e4 ? ` · <i>באיחור ${ageMin} דק׳</i>` : ""}\n\n` +
        `כניסה ≈ <code>${fp(entry)}</code>\n` +
        `סטופ <code>${fp(entry - s * risk)}</code>\n` +
        `יעד 1 (1R) <code>${fp(entry + s * risk)}</code>\n` +
        `יעד ${P.rr}R <code>${fp(entry + s * risk * P.rr)}</code>\n\n` +
        `ציון <b>${e.score > 0 ? "+" : ""}${e.score}</b> · ${regimeHe[e.regime]} · ADX ${e.adx.toFixed(0)}\n` +
        `${why}\n\n📊 ${hist}` + footer());
      state.open.push({ key, sigT: D.t[j] }); dirty = true;
    }
  }
  return rows;
}

/* ---------- Commands ---------- */
async function statusText() {
  const lines = [];
  for (const sym of CFG.assets) {
    const a = asset(sym), parts = [];
    let price = NaN;
    for (const tf of CFG.timeframes) {
      try {
        const { D, P, trades } = await analyze(sym, tf), e = D.ev[D.n - 2];
        price = D.c[D.n - 1];
        const open = trades.length && trades[trades.length - 1].out === "open" ? trades[trades.length - 1] : null;
        parts.push(`${tfL(tf)}: ${e ? (e.score > 0 ? "+" : "") + e.score : "–"}${open ? (open.dir > 0 ? " 🟢 לונג פעיל" : " 🔴 שורט פעיל") : ""}`);
      } catch (err) { parts.push(`${tfL(tf)}: שגיאה`); }
    }
    lines.push(`<b>${a.k}</b> <code>${fp(price)}</code>\n   ${parts.join(" · ")}`);
  }
  const p = state.perf;
  return `📡 <b>מצב הרדאר</b>\n\n${lines.join("\n")}\n\nסף איתות: ±${params(CFG.assets[0], CFG.timeframes[0]).th}\n` +
    (p.n ? `מעקב חי: ${p.n} עסקאות · ${pct(p.wins / p.n)} הצלחה · ${fR(p.R)}` : "מעקב חי: עדיין אין עסקאות סגורות") + footer();
}

async function handleUpdates(longPoll) {
  let ups = [];
  try { ups = await tg("getUpdates", { offset: state.offset + 1, timeout: longPoll ? 25 : 0, allowed_updates: ["message", "channel_post"] }); }
  catch (e) { console.error(e.message); return; }
  for (const u of ups) {
    state.offset = u.update_id; dirty = true;
    const m = u.message || u.channel_post; if (!m || !m.text) continue;
    const chat = String(m.chat.id), cmd = m.text.trim().split(/[\s@]/)[0].toLowerCase();
    if (cmd === "/start") {
      if (!state.chats.includes(chat)) state.chats.push(chat);
      await send(chat, `👋 <b>הרדאר מחובר.</b>\nתקבל כאן כל איתות חדש על ${CFG.assets.map(s => asset(s).k).join(", ")} בטווחי ${CFG.timeframes.map(tfL).join(", ")}, ודיווח כשהעסקה מגיעה ליעד או לסטופ.\n\n/status מצב נוכחי\n/stop הפסק התראות`);
      await send(chat, await statusText());
    } else if (cmd === "/status") {
      await send(chat, await statusText());
    } else if (cmd === "/stop") {
      state.chats = state.chats.filter(c => c !== chat);
      await send(chat, "ההתראות הופסקו. שלח /start כדי להפעיל שוב.");
    }
  }
}

/* ---------- Main ---------- */
async function once() {
  await handleUpdates(false);
  await scan();
  save();
}
async function main() {
  if (!TOKEN) { console.error("חסר BOT_TOKEN. צור בוט ב-@BotFather והגדר אותו כמשתנה סביבה / Secret."); process.exit(1); }
  if (!LOOP) { await once(); return; }
  console.log("Radar bot running in loop mode");
  let lastScan = 0;
  for (;;) {
    try {
      await handleUpdates(true); save();
      if (Date.now() - lastScan > (CFG.loopScanSeconds || 60) * 1000) { lastScan = Date.now(); await scan(); save(); }
    } catch (e) { console.error(e); await new Promise(r => setTimeout(r, 10000)); }
  }
}
main().catch(e => { console.error(e); save(); process.exit(1); });
