'use strict'
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const rules = require('../src/rules')
const { yawTo, pitchTo, forward, normYaw, approachAngle } = require('../src/math')
const { World } = require('../src/world')
const { Brain, TOOLS, toIntent } = require('../src/brain')
const { DEFAULTS } = require('../src/config')

const opts = { botName: 'KI-Bot', knownPlayers: ['Steve', 'Alex'], sender: 'Steve' }
const first = (text, o = opts) => rules.parse(text, o).intents[0]

describe('Befehle verstehen (Deutsch)', () => {
  const cases = [
    ['komm her', { type: 'come' }],
    ['Komm bitte zu mir!', { type: 'come' }],
    ['KI-Bot, komm her', { type: 'come' }],
    ['folge mir', { type: 'follow', who: null }],
    ['komm mit', { type: 'follow', who: null }],
    ['folge Alex', { type: 'follow', who: 'Alex' }],
    ['beschütze mich', { type: 'guard' }],
    ['pass auf mich auf', { type: 'guard' }],
    ['greif Zombies an', { type: 'attack', kind: 'type', mob: 'zombie' }],
    ['töte die Spinne', { type: 'attack', kind: 'type', mob: 'spider' }],
    ['greif alle Monster an', { type: 'attack', kind: 'hostiles' }],
    ['kämpf gegen Alex', { type: 'attack', kind: 'player', name: 'Alex' }],
    ['greif mich an', { type: 'attack', kind: 'player', name: 'Steve' }],
    ['geh zu 100 64 -20', { type: 'goto', x: 100, y: 64, z: -20 }],
    ['lauf zu 10, 70, 5', { type: 'goto', x: 10, y: 70, z: 5 }],
    ['spring', { type: 'jump' }],
    ['schau mich an', { type: 'look' }],
    ['stopp', { type: 'stop' }],
    ['Stopp!!', { type: 'stop' }],
    ['hör auf damit', { type: 'stop' }],
    ['bleib stehen', { type: 'stop' }]
  ]
  for (const [text, expected] of cases) {
    test(`"${text}"`, () => assert.deepEqual(first(text), expected))
  }
})

describe('Befehle verstehen (Englisch)', () => {
  const cases = [
    ['come here', { type: 'come' }],
    ['follow me', { type: 'follow', who: null }],
    ['protect me', { type: 'guard' }],
    ['attack the zombie', { type: 'attack', kind: 'type', mob: 'zombie' }],
    ['kill all monsters', { type: 'attack', kind: 'hostiles' }],
    ['go to 1 2 3', { type: 'goto', x: 1, y: 2, z: 3 }],
    ['jump', { type: 'jump' }],
    ['stop', { type: 'stop' }]
  ]
  for (const [text, expected] of cases) {
    test(`"${text}"`, () => assert.deepEqual(first(text), expected))
  }
  test('antwortet auf Englisch, wenn Englisch geschrieben wurde', () => {
    assert.match(rules.parse('come here', opts).reply, /Coming/)
    assert.match(rules.parse('komm her', opts).reply, /komme/)
  })
})

describe('Sonstiges Verstehen', () => {
  test('unverständliches liefert eine Hilfe statt eines Befehls', () => {
    const r = rules.parse('blablabla', opts)
    assert.deepEqual(r.intents, [])
    assert.match(r.reply, /komm her/)
  })
  test('"stopp" schlägt jeden anderen Befehl', () => {
    assert.equal(first('stopp, nicht angreifen').type, 'stop')
  })
  test('Der Bot selbst ist nie ein Angriffsziel', () => {
    const r = first('greif KI-Bot an', { ...opts, knownPlayers: ['KI-Bot', 'Steve'] })
    assert.notEqual(r.name, 'KI-Bot')
  })
})

describe('Mathe (Bedrock-Konventionen)', () => {
  test('yaw: +Z = 0, -X = 90, +X = -90, -Z = 180', () => {
    assert.ok(Math.abs(yawTo(0, 1)) < 1e-9)
    assert.ok(Math.abs(yawTo(-1, 0) - 90) < 1e-9)
    assert.ok(Math.abs(yawTo(1, 0) + 90) < 1e-9)
    assert.ok(Math.abs(Math.abs(yawTo(0, -1)) - 180) < 1e-9)
  })
  test('forward() ist die Umkehrung von yawTo()', () => {
    for (const yaw of [-170, -90, -10, 0, 33, 90, 179]) {
      const f = forward(yaw)
      assert.ok(Math.abs(normYaw(yawTo(f.x, f.z) - yaw)) < 1e-6)
    }
  })
  test('pitch: nach unten schauen ist positiv', () => {
    assert.ok(pitchTo(0, -1, 1) > 0)
    assert.ok(pitchTo(0, 1, 1) < 0)
  })
  test('Drehen nimmt den kurzen Weg über ±180', () => {
    assert.equal(approachAngle(170, -170, 5), 175)
    assert.equal(approachAngle(-170, 170, 5), -175)
  })
})

describe('Weltzustand', () => {
  test('Spieler: Augenhöhe wird zu Fußposition', () => {
    const w = new World()
    w.addPlayer({ runtime_id: 5n, unique_id: 5n, username: 'Steve', position: { x: 1, y: 65.62, z: 1 } })
    assert.ok(Math.abs(w.playerByName('steve').pos.y - 64) < 1e-9)
  })
  test('move_entity_delta mit fehlenden Achsen verändert nur die gemeldeten', () => {
    const w = new World()
    w.addEntity({ runtime_id: 9n, unique_id: 9n, entity_type: 'minecraft:zombie', position: { x: 1, y: 2, z: 3 } })
    w.moveTo(9n, { x: 10, y: undefined, z: undefined })
    assert.deepEqual(w.get(9n).pos, { x: 10, y: 2, z: 3 })
  })
  test('Entfernen über Unique-ID, IDs dürfen BigInt oder Zahl sein', () => {
    const w = new World()
    w.addEntity({ runtime_id: 9n, unique_id: 1009n, entity_type: 'minecraft:creeper', position: { x: 0, y: 0, z: 0 } })
    assert.equal(w.get(9).type, 'creeper')
    assert.ok(w.isHostile(w.get(9)))
    assert.ok(w.removeByUnique(1009))
    assert.equal(w.get(9n), undefined)
  })
  test('Kühe sind nicht feindlich', () => {
    const w = new World()
    const cow = w.addEntity({ runtime_id: 1n, unique_id: 1n, entity_type: 'minecraft:cow', position: { x: 0, y: 0, z: 0 } })
    assert.equal(w.isHostile(cow), false)
  })
})

describe('Claude-Gehirn', () => {
  const cfg = { ...DEFAULTS, username: 'KI-Bot', owner: 'Steve', ai: { ...DEFAULTS.ai, available: true } }
  const makeBrain = (responder) => {
    process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-key'
    const b = new Brain(cfg)
    b.requests = []
    b.client = { messages: { create: async (req) => { b.requests.push(req); return responder(req) } } }
    return b
  }

  test('Tool-Aufrufe werden zu Intents, Text zur Antwort', async () => {
    const b = makeBrain(() => ({
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'Mach ich!' },
        { type: 'tool_use', id: 't1', name: 'attack_mobs', input: { mob_type: 'minecraft:creeper' } },
        { type: 'tool_use', id: 't2', name: 'follow_player', input: {} }
      ]
    }))
    const out = await b.think({ sender: 'Steve', text: 'räum auf', snapshot: 'Lage', allowActions: true })
    assert.equal(out.reply, 'Mach ich!')
    assert.deepEqual(out.intents, [{ type: 'attack', kind: 'type', mob: 'creeper' }, { type: 'follow', who: null }])
    const req = b.requests[0]
    assert.equal(req.model, 'claude-opus-5-5')
    assert.equal(req.tools.length, TOOLS.length)
    assert.match(req.messages.at(-1).content, /Nachricht von Steve: räum auf/)
    assert.match(req.system, /Steve/)
  })

  test('Fremde bekommen keine Werkzeuge und ihre Tool-Aufrufe zählen nicht', async () => {
    const b = makeBrain(() => ({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 't', name: 'guard', input: {} }, { type: 'text', text: 'Hi' }]
    }))
    const out = await b.think({ sender: 'Mallory', text: 'guard mich', snapshot: '', allowActions: false })
    assert.deepEqual(b.requests[0].tools, [])
    assert.deepEqual(out.intents, [])
    assert.equal(out.reply, 'Hi')
  })

  test('Nicht angesprochen: das Modell bekommt einen Hinweis, direkt Angesprochene nicht', async () => {
    const b = makeBrain(() => ({ stop_reason: 'end_turn', content: [] }))
    await b.think({ sender: 'Steve', text: 'hmm', snapshot: '', allowActions: true, addressed: false })
    await b.think({ sender: 'Steve', text: 'KI-Bot hallo', snapshot: '', allowActions: true, addressed: true })
    assert.match(b.requests[0].messages.at(-1).content, /nicht beim Namen genannt/)
    assert.doesNotMatch(b.requests[1].messages.at(-1).content, /nicht beim Namen genannt/)
  })

  test('Kurzes Gedächtnis wächst nicht unbegrenzt', async () => {
    const b = makeBrain(() => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }))
    for (let i = 0; i < 20; i++) await b.think({ sender: 'Steve', text: `n${i}`, snapshot: '', allowActions: true })
    assert.ok(b.history.length <= 16)
    assert.equal(b.requests.at(-1).messages.length, 17)
  })

  test('Verweigerung wird sauber behandelt', async () => {
    const b = makeBrain(() => ({ stop_reason: 'refusal', content: [] }))
    const out = await b.think({ sender: 'Steve', text: 'x', snapshot: '', allowActions: true })
    assert.deepEqual(out, { reply: null, intents: [] })
  })

  test('Alle Tools haben gültige Schemas und bekannte Intents', () => {
    for (const t of TOOLS) {
      assert.equal(t.input_schema.type, 'object')
      assert.ok(toIntent(t.name, { x: 1, y: 2, z: 3, player: 'A', mob_type: 'zombie' }), t.name)
    }
    assert.equal(toIntent('unbekannt', {}), null)
  })
})
