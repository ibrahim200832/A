'use strict'
// Echter Netzwerktest: Der Bot verbindet sich über RakNet/UDP mit einem bedrock-protocol-Server
// (Login, Verschlüsselung, Chat in beide Richtungen). Läuft komplett lokal.
require('./helpers/stub-raknet')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const bedrock = require('bedrock-protocol')
const { Bot } = require('../src/bot')
const { DEFAULTS } = require('../src/config')

const VERSION = '1.26.45'
const PORT = 19000 + Math.floor(Math.random() * 900)

test('Bot meldet sich an einem Bedrock-Server an und chattet in beide Richtungen', async (t) => {
  const server = bedrock.createServer({
    host: '127.0.0.1', port: PORT, version: VERSION, offline: true, raknetBackend: 'jsp-raknet', maxPlayers: 5
  })

  const botSaid = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Keine Antwort vom Bot im Chat')), 15000)
    server.on('connect', (client) => {
      client.on('join', () => {
        // Der "Besitzer" schreibt dem Bot, sobald er drin ist
        client.write('text', {
          needs_translation: false, category: 'authored', type: 'chat', source_name: 'Steve',
          message: 'KI-Bot komm her', xuid: '', platform_chat_id: '', has_filtered_message: false, filtered_message: ''
        })
      })
      client.on('text', (p) => {
        if (p.source_name === 'KI-Bot') { clearTimeout(timer); resolve({ joinedAs: client.profile?.name, text: p.message }) }
      })
    })
  })

  const cfg = {
    ...DEFAULTS,
    ai: { ...DEFAULTS.ai, available: false },
    host: '127.0.0.1', port: PORT, username: 'KI-Bot', owner: 'Steve', offline: true,
    version: VERSION, raknetBackend: 'jsp-raknet', skipPing: true, greeting: '', autoReconnect: false
  }
  const bot = new Bot(cfg)
  t.after(() => { bot.disconnect(); server.close() })
  bot.connect()

  const result = await botSaid
  assert.equal(result.joinedAs, 'KI-Bot')
  // Steve ist nicht in der (leeren) Welt sichtbar -> der Bot sagt das ehrlich
  assert.match(result.text, /Steve/)
})
