#!/usr/bin/env node
'use strict'
const { load } = require('./config')
const { Bot } = require('./bot')

function main () {
  let cfg
  try {
    cfg = load(process.argv[2])
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }

  console.log('================ Minecraft Bedrock KI-Bot ================')
  console.log(`Server:   ${cfg.host}:${cfg.port}   (${cfg.offline ? 'offline-Login' : 'Xbox-Login'})`)
  console.log(`Name:     ${cfg.username}`)
  console.log(`Besitzer: ${cfg.owner || '(keiner gesetzt – JEDER im Chat kann Befehle geben, wenn er meinen Namen nennt!)'}`)
  console.log(`Version:  ${cfg.version || 'automatisch erkennen'}`)
  if (cfg.ai.available) {
    console.log(`Verstehen: Claude (${cfg.ai.model}) + eingebaute Befehle`)
  } else {
    console.log('Verstehen: nur eingebaute Befehle (setze ANTHROPIC_API_KEY, damit ich dich auch bei freien Sätzen verstehe)')
  }
  console.log('===========================================================')

  const bot = new Bot(cfg)
  bot.connect()

  const quit = () => {
    console.log('\nTschüss!')
    bot.disconnect()
    setTimeout(() => process.exit(0), 300)
  }
  process.on('SIGINT', quit)
  process.on('SIGTERM', quit)
}

main()
