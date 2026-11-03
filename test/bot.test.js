'use strict'
const { test, describe, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { FakeClient, fakeBedrock, pkt } = require('./helpers/fake-client')
const { Bot } = require('../src/bot')
const { DEFAULTS } = require('../src/config')
const { dist } = require('../src/math')

for (const version of ['1.26.45', '1.21.50']) {
  describe(version, () => suite(version))
}

function suite (version) {
  let client, bot

  const cfgFor = (extra = {}) => ({
    ...DEFAULTS, ai: { ...DEFAULTS.ai, available: false }, owner: 'Steve', greeting: '', username: 'KI-Bot', ...extra
  })

  function setup (extra = {}, brain = { available: false }) {
    client = new FakeClient(version)
    bot = new Bot(cfgFor(extra), { bedrock: fakeBedrock(client), brain })
    bot.connect()
    client.emit('start_game', pkt.startGame(0, 64, 0))
    bot.controller.paused = false // Ticks steuern wir im Test selbst
    return bot
  }
  // Chat, der schon raus ist + Chat, der wegen Anti-Spam noch wartet
  const chats = () => client.chats().concat(bot.chatQueue)
  const ticks = (n) => { for (let i = 0; i < n; i++) bot.controller.tick() }
  const say = async (who, msg) => { client.emit('text', pkt.chat(who, msg)); await bot.msgChain }

  beforeEach(() => setup())
  afterEach(() => bot.disconnect())

  test(`[${version}] Start: Position und Spawn werden übernommen`, () => {
    assert.deepEqual(bot.controller.pos, { x: 0, y: 64, z: 0 })
    ticks(2)
    assert.equal(client.of('player_auth_input').length, 2)
  })

  test(`[${version}] "komm her": Bot läuft zum Besitzer und bleibt in der Nähe stehen`, async () => {
    client.emit('add_player', pkt.addPlayer('Steve', 5, 12, 64, 0))
    await say('Steve', 'komm her')
    assert.ok(client.chats().some(m => /komm/i.test(m)), 'Bot antwortet im Chat')
    ticks(80)
    const d = dist(bot.controller.pos, { x: 12, y: 64, z: 0 })
    assert.ok(d < 2.6, `Bot sollte nah bei Steve sein, Abstand ${d.toFixed(2)}`)
    assert.equal(bot.controller.task, null, 'Aufgabe ist beendet')
    // Er hat in Laufrichtung geschaut: Ziel liegt bei +X -> yaw -90
    assert.ok(Math.abs(bot.controller.yaw - -90) < 5, `yaw ${bot.controller.yaw}`)
  })

  test(`[${version}] Laufgeschwindigkeit bleibt unter dem Vanilla-Limit`, async () => {
    client.emit('add_player', pkt.addPlayer('Steve', 5, 40, 64, 0))
    await say('Steve', 'komm her')
    ticks(40)
    const x = bot.controller.pos.x
    assert.ok(x > 5 && x <= 40 * 0.28, `x=${x}`)
  })

  test(`[${version}] "folge mir": Bot folgt dem Besitzer, auch wenn der weiterläuft`, async () => {
    client.emit('add_player', pkt.addPlayer('Steve', 5, 10, 64, 0))
    await say('Steve', 'folge mir')
    ticks(50)
    client.emit('move_player', { runtime_id: 5n, position: { x: 10, y: 64 + 1.62, z: 30 }, mode: 'normal', on_ground: true })
    ticks(200)
    const d = dist(bot.controller.pos, { x: 10, y: 64, z: 30 })
    assert.ok(d < 4.5, `Abstand ${d.toFixed(2)}`)
    assert.equal(bot.controller.task.name, 'follow')
  })

  test(`[${version}] "stopp" beendet die Aufgabe sofort`, async () => {
    client.emit('add_player', pkt.addPlayer('Steve', 5, 30, 64, 0))
    await say('Steve', 'folge mir')
    ticks(10)
    const x = bot.controller.pos.x
    await say('Steve', 'stopp!')
    ticks(10)
    assert.equal(bot.controller.task, null)
    assert.ok(Math.abs(bot.controller.pos.x - x) < 1e-9, 'Bot bewegt sich nicht mehr')
  })

  test(`[${version}] Angriff: läuft zum Zombie, schlägt zu (animate + inventory_transaction) und meldet Erfolg`, async () => {
    client.emit('add_player', pkt.addPlayer('Steve', 5, 0, 64, -5))
    client.emit('add_entity', pkt.addEntity('zombie', 77, 8, 64, 0))
    await say('Steve', 'greif den Zombie an')
    assert.equal(bot.controller.task.name, 'attack')
    ticks(60)
    const hits = client.of('inventory_transaction')
    assert.ok(hits.length >= 2, `Treffer: ${hits.length}`)
    const td = hits[0].params.transaction.transaction_data
    assert.equal(String(td.entity_runtime_id), '77')
    assert.equal(td.action_type, 'attack')
    assert.ok(client.of('animate').length >= hits.length)
    // Nicht jeden Tick zuschlagen (Cooldown)
    assert.ok(hits.length <= 60 / 10 + 1)
    // Zombie stirbt -> Entity verschwindet -> Bot meldet "Erledigt"
    client.emit('remove_entity', { entity_id_self: 1077n })
    ticks(60)
    assert.equal(bot.controller.task, null)
    assert.ok(chats().includes('Erledigt!'))
  })

  test(`[${version}] Der Bot greift den Besitzer nie an (auch nicht bei "alles")`, async () => {
    client.emit('add_player', pkt.addPlayer('Steve', 5, 3, 64, 0))
    await say('Steve', 'greif alles an')
    ticks(60)
    assert.equal(client.of('inventory_transaction').length, 0)
  })

  test(`[${version}] Spieler angreifen ist standardmäßig gesperrt`, async () => {
    client.emit('add_player', pkt.addPlayer('Steve', 5, 3, 64, 0))
    await say('Steve', 'greif mich an')
    ticks(40)
    assert.equal(client.of('inventory_transaction').length, 0)
    assert.ok(client.chats().some(m => /allowPlayerAttacks/.test(m)))
  })

  test(`[${version}] Spieler angreifen klappt, wenn der Besitzer es erlaubt hat`, async () => {
    bot.disconnect()
    setup({ allowPlayerAttacks: true })
    client.emit('add_player', pkt.addPlayer('Steve', 5, 6, 64, 0))
    await say('Steve', 'greif mich an')
    ticks(80)
    assert.ok(client.of('inventory_transaction').length >= 1)
  })

  test(`[${version}] Fremde dürfen keine Befehle geben`, async () => {
    client.emit('add_player', pkt.addPlayer('Mallory', 6, 10, 64, 0))
    await say('Mallory', 'KI-Bot komm her')
    assert.equal(bot.controller.task, null)
    assert.ok(client.chats().some(m => /Besitzer/.test(m)))
  })

  test(`[${version}] Beschützen: folgt dem Besitzer und greift Monster in der Nähe an`, async () => {
    client.emit('add_player', pkt.addPlayer('Steve', 5, 4, 64, 0))
    await say('Steve', 'beschütze mich')
    assert.equal(bot.controller.task.name, 'guard')
    ticks(40)
    assert.equal(client.of('inventory_transaction').length, 0, 'ohne Gegner kein Angriff')
    client.emit('add_entity', pkt.addEntity('skeleton', 90, 9, 64, 2))
    ticks(80)
    assert.ok(client.of('inventory_transaction').length >= 1)
    assert.ok(chats().some(m => /skeleton/.test(m)))
  })

  test(`[${version}] Springen`, async () => {
    await say('Steve', 'spring')
    const ys = []
    for (let i = 0; i < 20; i++) { ticks(1); ys.push(bot.controller.pos.y) }
    assert.ok(Math.max(...ys) > 64.5, 'ist hochgesprungen')
    assert.equal(bot.controller.pos.y, 64, 'ist wieder gelandet')
    const flags = client.of('player_auth_input').map(p => p.params.input_data)
    const has = (f, n) => Array.isArray(f) ? f.includes(n) : Boolean(f[n])
    assert.ok(flags.some(f => has(f, 'start_jumping')))
  })

  test(`[${version}] Eingaben beim Laufen: vorwärts + Sprint-Flags`, async () => {
    client.emit('add_player', pkt.addPlayer('Steve', 5, 40, 64, 0))
    await say('Steve', 'folge mir')
    ticks(30)
    const inputs = client.of('player_auth_input').map(p => p.params)
    const last = inputs.at(-1)
    assert.equal(last.move_vector.z, 1)
    const has = (f, n) => Array.isArray(f) ? f.includes(n) : Boolean(f[n])
    assert.ok(inputs.some(p => has(p.input_data, 'start_sprinting')))
    assert.ok(has(last.input_data, 'up'))
  })

  test(`[${version}] Server-Korrektur (Teleport) wird übernommen`, () => {
    client.emit('move_player', { runtime_id: 1n, position: { x: 100, y: 70 + 1.62, z: -5 }, mode: 'teleport', on_ground: true })
    assert.deepEqual(bot.controller.pos, { x: 100, y: 70, z: -5 })
    assert.equal(bot.controller.groundY, 70)
  })

  test(`[${version}] Tod: Bot bricht ab, fordert Respawn an und läuft danach weiter`, async () => {
    client.emit('add_player', pkt.addPlayer('Steve', 5, 30, 64, 0))
    await say('Steve', 'folge mir')
    client.emit('set_health', { health: 0 })
    assert.equal(bot.dead, true)
    assert.equal(bot.controller.task, null)
    const before = client.of('player_auth_input').length
    ticks(5)
    assert.equal(client.of('player_auth_input').length, before, 'tot = keine Bewegungspakete')
    await new Promise(r => setTimeout(r, 1300))
    assert.equal(client.of('player_action')[0].params.action, 'respawn')
    client.emit('respawn', { position: { x: 3, y: 65 + 1.62, z: 3 }, state: 0, runtime_entity_id: 1n })
    assert.equal(client.of('respawn')[0].params.state, 2)
    assert.equal(bot.dead, false)
    assert.deepEqual(bot.controller.pos, { x: 3, y: 65, z: 3 })
  })

  test(`[${version}] Chat: lange Texte werden gekürzt, Zeilenumbrüche und Farbcodes entfernt`, () => {
    bot.say('§aHallo\nWelt')
    assert.deepEqual(client.chats(), ['Hallo Welt'])
    bot.say('x'.repeat(450))
    assert.equal(bot.chatQueue.length, 3) // 200 + 200 + 50, rausgeschickt im Abstand von ~1 s
    for (const m of client.of('text')) {
      assert.equal(m.params.type, 'chat')
      assert.equal(m.params.source_name, 'KI-Bot')
    }
  })

  test(`[${version}] Xbox-Login: der Bot übernimmt den Spielernamen des Kontos und ignoriert seine eigenen Nachrichten`, async () => {
    bot.disconnect()
    client = new FakeClient(version, 'BotKonto123')
    bot = new Bot(cfgFor(), { bedrock: fakeBedrock(client), brain: { available: false } })
    bot.connect()
    client.emit('start_game', pkt.startGame(0, 64, 0))
    bot.controller.paused = false
    assert.equal(bot.cfg.username, 'BotKonto123')
    await say('BotKonto123', 'komm her')
    assert.equal(bot.controller.task, null, 'eigene Nachricht ignoriert')
    client.emit('add_player', pkt.addPlayer('Steve', 5, 10, 64, 0))
    await say('Steve', 'BotKonto123 komm her')
    assert.equal(bot.controller.task.name, 'goto')
  })

  test(`[${version}] Eigene Nachrichten und fremdes Geplauder werden ignoriert`, async () => {
    await say('KI-Bot', 'komm her')
    await say('Alex', 'hallo zusammen')
    assert.equal(bot.controller.task, null)
    assert.equal(client.chats().length, 0)
  })

  test(`[${version}] Besitzer plaudert mit anderen: Bot bleibt still, führt aber klare Befehle trotzdem aus`, async () => {
    client.emit('add_player', pkt.addPlayer('Steve', 5, 10, 64, 0))
    await say('Steve', 'gestern war ich im Wald und hab Eisen gefunden')
    assert.equal(chats().length, 0, 'keine Antwort auf fremdes Geplauder')
    await say('Steve', 'komm her')
    assert.equal(bot.controller.task.name, 'goto')
    await say('Steve', 'KI-Bot blablabla')
    assert.ok(chats().some(m => /nicht verstanden/.test(m)), 'beim Namen gerufen: Hilfe anzeigen')
  })

  test(`[${version}] Mit KI: nicht angesprochen -> Hinweis ans Modell, sonst nichts`, async () => {
    bot.disconnect()
    const brain = { available: true, calls: [], async think (a) { this.calls.push(a); return { reply: null, intents: [] } } }
    setup({}, brain)
    await say('Steve', 'ich glaub ich geh gleich schlafen')
    assert.equal(brain.calls[0].addressed, false)
    assert.equal(chats().length, 0)
    await say('Steve', 'KI-Bot, wie viel Leben hast du?')
    assert.equal(brain.calls[1].addressed, true)
  })

  test(`[${version}] Mit KI: Absicht kommt vom Gehirn und wird ausgeführt`, async () => {
    bot.disconnect()
    const brain = {
      available: true,
      calls: [],
      async think (args) {
        this.calls.push(args)
        return { reply: 'Klar, ich hau die Zombies um!', intents: [{ type: 'attack', kind: 'type', mob: 'zombie' }] }
      }
    }
    setup({}, brain)
    client.emit('add_player', pkt.addPlayer('Steve', 5, 0, 64, -5))
    client.emit('add_entity', pkt.addEntity('zombie', 77, 5, 64, 0))
    await say('Steve', 'Ey, kannst du mal bitte die grünen Kerle da vorne aufräumen?')
    assert.equal(brain.calls.length, 1)
    assert.match(brain.calls[0].snapshot, /zombie/)
    assert.equal(brain.calls[0].allowActions, true)
    assert.equal(bot.controller.task.name, 'attack')
    assert.ok(client.chats().includes('Klar, ich hau die Zombies um!'))
  })

  test(`[${version}] Mit KI: "stopp" wartet nicht auf die KI`, async () => {
    bot.disconnect()
    const brain = { available: true, async think () { throw new Error('darf nicht aufgerufen werden') } }
    setup({}, brain)
    client.emit('add_player', pkt.addPlayer('Steve', 5, 30, 64, 0))
    bot.execute({ type: 'follow', who: null }, 'Steve')
    await say('Steve', 'stopp')
    assert.equal(bot.controller.task, null)
  })

  test(`[${version}] Mit KI: Ausfall der KI fällt auf eingebaute Befehle zurück`, async () => {
    bot.disconnect()
    const brain = { available: true, async think () { throw new Error('offline') } }
    setup({}, brain)
    client.emit('add_player', pkt.addPlayer('Steve', 5, 30, 64, 0))
    await say('Steve', 'folge mir')
    assert.equal(bot.controller.task.name, 'follow')
  })

  test(`[${version}] Mit KI: Fremde bekommen nur Chat, keine Werkzeuge`, async () => {
    bot.disconnect()
    const brain = {
      available: true,
      calls: [],
      async think (a) { this.calls.push(a); return { reply: 'Hallo!', intents: [{ type: 'stop' }, { type: 'guard' }] } }
    }
    setup({}, brain)
    client.emit('add_player', pkt.addPlayer('Mallory', 6, 5, 64, 0))
    await say('Mallory', 'KI-Bot wie gehts?')
    assert.equal(brain.calls[0].allowActions, false)
    assert.equal(bot.controller.task, null, 'Intents von Fremden werden verworfen')
    assert.ok(client.chats().includes('Hallo!'))
  })
}
