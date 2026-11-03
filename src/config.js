'use strict'
const fs = require('fs')
const path = require('path')

const DEFAULTS = {
  host: '127.0.0.1',
  port: 19132,
  username: 'KI-Bot',
  // offline=true: kein Xbox-Login nötig (Server mit online-mode=false / LAN-Test-Server).
  // offline=false: der Bot loggt sich mit einem Microsoft-Konto ein (Gerätecode erscheint im Terminal).
  offline: true,
  owner: '',
  // null = Serverversion automatisch erkennen
  version: null,
  raknetBackend: 'raknet-native',
  language: 'de',
  alwaysListenToOwner: true,
  allowPlayerAttacks: false,
  greeting: 'Hi! Ich bin da. Sag mir einfach, was ich tun soll.',
  ai: {
    enabled: true,
    model: 'claude-opus-5-5',
    effort: 'low',
    timeoutMs: 20000
  }
}

function load (file) {
  const cfgPath = file || process.env.BOT_CONFIG || path.join(process.cwd(), 'config.json')
  let user = {}
  if (fs.existsSync(cfgPath)) {
    try {
      user = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    } catch (e) {
      throw new Error(`config.json ist kein gültiges JSON (${cfgPath}): ${e.message}`)
    }
  }
  const cfg = { ...DEFAULTS, ...user, ai: { ...DEFAULTS.ai, ...(user.ai || {}) } }

  // Umgebungsvariablen haben Vorrang
  if (process.env.BOT_HOST) cfg.host = process.env.BOT_HOST
  if (process.env.BOT_PORT) cfg.port = Number(process.env.BOT_PORT)
  if (process.env.BOT_NAME) cfg.username = process.env.BOT_NAME
  if (process.env.BOT_OWNER) cfg.owner = process.env.BOT_OWNER
  if (process.env.BOT_VERSION) cfg.version = process.env.BOT_VERSION
  if (process.env.CLAUDE_MODEL) cfg.ai.model = process.env.CLAUDE_MODEL

  // Ohne API-Key läuft der Bot trotzdem – dann nur mit dem eingebauten Befehlsverstehen.
  cfg.ai.available = Boolean(cfg.ai.enabled && (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN))
  return cfg
}

module.exports = { load, DEFAULTS }
