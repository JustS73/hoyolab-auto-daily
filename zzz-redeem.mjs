// Автоактивация промокодов Zenless Zone Zero
// Источник кодов: https://hoyo-codes.seria.moe (game=nap)
// Node 20+, без зависимостей.

import fs from 'node:fs'

const COOKIE = process.env.ZZZ_COOKIE   // "account_id_v2=...; account_mid_v2=...; cookie_token_v2=..."
const UID = process.env.ZZZ_UID         // UID в игре
const REGION = process.env.ZZZ_REGION || 'prod_gf_eu' // eu | prod_gf_us | prod_gf_jp (Asia) | prod_gf_sg (TW/HK/MO)
const TG_TOKEN = process.env.TELEGRAM_TOKEN
const TG_CHAT = process.env.TELEGRAM_CHAT_ID
const STATE = process.env.ZZZ_STATE || 'redeemed-zzz.json'

if (!COOKIE || !UID) {
  console.error('Нужны ZZZ_COOKIE и ZZZ_UID')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) } catch { return [] } }
const saveState = (s) => fs.writeFileSync(STATE, JSON.stringify([...new Set(s)].sort(), null, 2) + '\n')

async function tg(text) {
  if (!TG_TOKEN || !TG_CHAT) return
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text }),
  }).catch(() => {})
}

async function getCodes() {
  const r = await fetch('https://hoyo-codes.seria.moe/codes?game=nap')
  if (!r.ok) throw new Error(`API кодов ответил ${r.status}`)
  const j = await r.json()
  return (j.codes ?? []).map((c) => (c.code ?? '').trim().toUpperCase()).filter(Boolean)
}

async function redeem(code) {
  const url = new URL('https://public-operation-nap.hoyoverse.com/common/apicdkey/api/webExchangeCdkey')
  url.search = new URLSearchParams({
    t: String(Date.now()),
    lang: 'en',
    game_biz: 'nap_global',
    uid: UID,
    region: REGION,
    cdkey: code,
  })
  const r = await fetch(url, {
    headers: {
      Cookie: COOKIE,
      Origin: 'https://zenless.hoyoverse.com',
      Referer: 'https://zenless.hoyoverse.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
    },
  })
  return r.json()
}

// retcode, после которых код больше не трогаем
const FINAL = {
  0: 'активирован ✅',
  '-2017': 'уже активирован',
  '-2018': 'уже активирован',
  '-2001': 'истёк',
  '-2003': 'недействителен',
}

const done = loadState()
const codes = (await getCodes()).filter((c) => !done.includes(c))
console.log(`Новых кодов: ${codes.length}`)

const report = []
for (const code of codes) {
  let res = await redeem(code)
  if (res.retcode === -2016) { // кулдаун между активациями
    await sleep(6000)
    res = await redeem(code)
  }
  const label = FINAL[res.retcode]
  console.log(code, res.retcode, res.message)

  if (res.retcode === -1071 || res.retcode === -100) {
    report.push('❌ Куки протухли — обнови cookie_token_v2 в ZZZ_COOKIE')
    break
  }
  if (label) {
    done.push(code)
    if (res.retcode === 0) report.push(`${code}: ${label}`)
  } else {
    report.push(`${code}: ${res.retcode} ${res.message}`)
  }
  await sleep(6000) // HoYo не даёт активировать чаще ~раз в 5 сек
}

saveState(done)
if (report.length) await tg(`ZZZ промокоды:\n${report.join('\n')}`)
