'use strict'
// Eingebautes Befehlsverstehen (Deutsch + Englisch). Läuft sofort, ohne Internet und ohne API-Key.
// Gibt { intents: [...], reply: string|null } zurück. Leere intents = nicht verstanden.

const MOBS = {
  zombie: 'zombie', zombies: 'zombie',
  skelett: 'skeleton', skelette: 'skeleton', skeleton: 'skeleton', skeletons: 'skeleton',
  creeper: 'creeper',
  spinne: 'spider', spinnen: 'spider', spider: 'spider', spiders: 'spider',
  hexe: 'witch', hexen: 'witch', witch: 'witch',
  enderman: 'enderman', endermen: 'enderman',
  schleim: 'slime', slime: 'slime', slimes: 'slime',
  phantom: 'phantom', phantome: 'phantom', phantoms: 'phantom',
  ertrunkene: 'drowned', drowned: 'drowned',
  plünderer: 'pillager', pluenderer: 'pillager', pillager: 'pillager',
  blaze: 'blaze', ghast: 'ghast', silberfischchen: 'silverfish', silverfish: 'silverfish',
  huhn: 'chicken', huehner: 'chicken', chicken: 'chicken',
  kuh: 'cow', kuehe: 'cow', cow: 'cow', schwein: 'pig', schweine: 'pig', pig: 'pig',
  schaf: 'sheep', schafe: 'sheep', sheep: 'sheep'
}

const ANY_MONSTER = /\b(monster|monstern|mobs?|gegner|feinde?|feind|hostile|enemies|enemy|alles)\b/

function norm (s) {
  return String(s)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[!?.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Sehr grobe Spracherkennung, nur für die Antwortsprache der Regeln.
function guessLang (t, fallback) {
  if (/\b(come|follow|attack|stop|here|me|please|kill|fight|guard|jump)\b/.test(t)) return 'en'
  if (/\b(komm|komme|folge|folg|greif|greife|stopp|hier|mir|mich|bitte|toete|kaempf|beschuetze|spring)\b/.test(t)) return 'de'
  return fallback || 'de'
}

const T = {
  de: {
    ok: 'Alles klar!',
    stop: 'Okay, ich höre auf.',
    come: 'Ich komme!',
    follow: 'Ich folge dir.',
    followWho: (n) => `Ich folge ${n}.`,
    guard: 'Ich pass auf dich auf!',
    attackMobs: 'Ich kümmere mich um die Monster.',
    attackType: (m) => `Ich greife ${m} an.`,
    attackPlayer: (n) => `Ich greife ${n} an.`,
    goto: (x, y, z) => `Ich gehe zu ${x} ${y} ${z}.`,
    jump: 'Hüpf!',
    look: 'Ich schau dich an.',
    help: 'Das habe ich nicht verstanden. Probier z.B.: "komm her", "folge mir", "beschütze mich", "greif Zombies an", "geh zu 100 64 -20" oder "stopp".'
  },
  en: {
    ok: 'Got it!',
    stop: 'Okay, stopping.',
    come: 'Coming!',
    follow: 'Following you.',
    followWho: (n) => `Following ${n}.`,
    guard: "I've got your back!",
    attackMobs: "I'll deal with the monsters.",
    attackType: (m) => `Attacking ${m}.`,
    attackPlayer: (n) => `Attacking ${n}.`,
    goto: (x, y, z) => `Going to ${x} ${y} ${z}.`,
    jump: 'Hop!',
    look: 'Looking at you.',
    help: `I didn't get that. Try: "come here", "follow me", "protect me", "attack zombies", "go to 100 64 -20" or "stop".`
  }
}

function parse (text, { botName = '', knownPlayers = [], sender = '', lang = 'de' } = {}) {
  let t = norm(text)
  // Den eigenen Namen am Anfang entfernen: "bot, komm her"
  const nameN = norm(botName)
  if (nameN && t.startsWith(nameN)) t = t.slice(nameN.length).trim()
  if (!t) return { intents: [], reply: null }

  const L = T[guessLang(t, lang)]
  const words = t.split(' ')

  // 1) STOPP – hat immer Vorrang
  if (
    (words.length <= 5 && /\b(stop|stopp|halt|warte|bleib|pause|cancel|freeze|stay|wait|aufhoeren)\b/.test(t)) ||
    /\b(hoer auf|hoere auf|lass das|nicht mehr|aufhoeren|stop it|stop that)\b/.test(t)
  ) {
    return { intents: [{ type: 'stop' }], reply: L.stop }
  }

  // 2) Beschützen
  if (/(beschuetz|schuetz mich|bewach|verteidig|pass auf mich auf|\bguard\b|\bprotect\b|\bdefend\b|\bbodyguard\b)/.test(t)) {
    return { intents: [{ type: 'guard' }], reply: L.guard }
  }

  // 3) Angreifen
  if (/(greif|attack|kaempf|bekaempf|toete|toet |\bkill\b|\bfight\b|vernicht|\bhau\b|schlag)/.test(t)) {
    // Spieler beim Namen?
    for (const w of words) {
      const p = knownPlayers.find(n => norm(n) === w && norm(n) !== nameN)
      if (p) return { intents: [{ type: 'attack', kind: 'player', name: p }], reply: L.attackPlayer(p) }
    }
    if (/\b(mich|me)\b/.test(t) && sender) {
      return { intents: [{ type: 'attack', kind: 'player', name: sender }], reply: L.attackPlayer(sender) }
    }
    for (const w of words) {
      if (MOBS[w]) return { intents: [{ type: 'attack', kind: 'type', mob: MOBS[w] }], reply: L.attackType(MOBS[w]) }
    }
    return { intents: [{ type: 'attack', kind: 'hostiles' }], reply: ANY_MONSTER.test(t) ? L.attackMobs : L.ok }
  }

  // 4) Hingehen zu Koordinaten
  const coords = t.match(/(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/)
  if (coords && /(geh|lauf|go|walk|move|bewege|reise|to)\b/.test(t)) {
    const [x, y, z] = coords.slice(1).map(Number)
    return { intents: [{ type: 'goto', x, y, z }], reply: L.goto(Math.round(x), Math.round(y), Math.round(z)) }
  }

  // 5) Folgen
  if (/(folg|follow|komm mit|come with|begleit)/.test(t)) {
    for (const w of words) {
      const p = knownPlayers.find(n => norm(n) === w && norm(n) !== nameN)
      if (p && !/\b(mir|me)\b/.test(t)) return { intents: [{ type: 'follow', who: p }], reply: L.followWho(p) }
    }
    return { intents: [{ type: 'follow', who: null }], reply: L.follow }
  }

  // 6) Herkommen
  if (/(\bkomm\b|\bkomme\b|\bkommt\b|\bcome\b|hierher|zu mir|\bher\b|\bhere\b)/.test(t)) {
    return { intents: [{ type: 'come' }], reply: L.come }
  }

  // 7) Springen
  if (/(spring|huepf|\bjump\b|\bhop\b)/.test(t)) {
    return { intents: [{ type: 'jump' }], reply: L.jump }
  }

  // 8) Anschauen
  if (/(schau mich|guck mich|sieh mich|look at me|schau zu mir)/.test(t)) {
    return { intents: [{ type: 'look' }], reply: L.look }
  }

  return { intents: [], reply: L.help }
}

module.exports = { parse, norm, MOBS }
