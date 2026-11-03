'use strict'
const { EventEmitter } = require('events')
const { World, EYE_HEIGHT } = require('./world')
const { Controller } = require('./controller')
const { GotoTask, FollowTask, AttackTask, GuardTask } = require('./tasks')
const packets = require('./packets')
const rules = require('./rules')
const { Brain } = require('./brain')
const { dist } = require('./math')

const CHAT_INTERVAL_MS = 900
const CHAT_MAX_LEN = 200

const sameName = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase()

class Bot extends EventEmitter {
  // deps.bedrock: die bedrock-protocol-Bibliothek (für Tests austauschbar)
  constructor (cfg, deps = {}) {
    super()
    this.cfg = cfg
    this.bedrock = deps.bedrock || require('bedrock-protocol')
    this.world = new World()
    this.brain = deps.brain || new Brain(cfg, (...a) => this.log(...a))
    this.client = null
    this.selfRuntime = null
    this.selfUnique = null
    this.health = 20
    this.dead = false
    this.heldItem = null
    this.hotbarSlot = 0
    this.hotbar = []
    this.chatQueue = []
    this.chatTimer = null
    this.msgChain = Promise.resolve()
    this.pendingMessages = 0
    this.greeted = false
    this.stopping = false
    this.lastCommander = null

    this.controller = new Controller({
      send: (pkt) => this.send(pkt),
      onAttack: (target) => this.attackEntity(target),
      log: (...a) => this.log(...a)
    })
    this.controller.buildInput = (s) => packets.authInput(this.client, s)
  }

  log (...args) {
    const t = new Date().toLocaleTimeString('de-DE')
    console.log(`[${t}]`, ...args)
  }

  // ---------- Verbindung ----------

  connect () {
    const { host, port, username, offline, version, raknetBackend } = this.cfg
    const opts = { host, port, username, offline, raknetBackend, skipPing: Boolean(this.cfg.skipPing) }
    if (version) opts.version = version
    if (!offline) opts.profilesFolder = this.cfg.profilesFolder || './.bedrock-auth'
    this.log(`Verbinde mit ${host}:${port} als "${username}" ...`)
    const client = this.bedrock.createClient(opts)
    this.client = client
    this.attach(client)
    return client
  }

  disconnect () {
    this.stopping = true
    this.controller.stop()
    clearInterval(this.chatTimer)
    try { this.client && this.client.close() } catch {}
  }

  send (pkt) {
    if (!this.client) return
    try {
      this.client.queue(pkt[0], pkt[1])
    } catch (e) {
      this.log(`Paket "${pkt[0]}" konnte nicht gesendet werden:`, e.message.split('\n')[0])
    }
  }

  attach (client) {
    client.on('error', (e) => this.log('Verbindungsfehler:', e.message || e))
    client.on('kick', (p) => this.log('Vom Server geworfen:', p.message || p.reason || JSON.stringify(p)))
    client.on('close', () => {
      this.log('Verbindung beendet.')
      this.controller.stop()
      this.world.clear()
      this.emit('close')
      if (!this.stopping && this.cfg.autoReconnect !== false) {
        setTimeout(() => { if (!this.stopping) this.connect() }, 5000)
      }
    })

    client.on('start_game', (p) => {
      this.selfRuntime = p.runtime_entity_id
      this.selfUnique = p.entity_id
      const rot = p.rotation || {}
      this.controller.setPosition(
        { x: p.player_position.x, y: p.player_position.y - EYE_HEIGHT, z: p.player_position.z },
        { pitch: rot.x || 0, yaw: rot.z || 0 }
      )
    })

    client.on('spawn', () => {
      this.log('Im Spiel! Position:', this.fmtPos(this.controller.pos))
      this.controller.start()
      this.emit('spawn')
      if (!this.greeted && this.cfg.greeting) {
        this.greeted = true
        setTimeout(() => this.say(this.cfg.greeting), 1500)
      }
    })

    client.on('add_player', (p) => {
      if (String(p.runtime_id) === String(this.selfRuntime)) return
      this.world.addPlayer(p)
    })
    client.on('add_entity', (p) => this.world.addEntity(p))
    client.on('remove_entity', (p) => this.world.removeByUnique(p.entity_id_self))
    client.on('move_entity', (p) => this.world.moveTo(p.runtime_entity_id, p.position))
    client.on('move_entity_delta', (p) => this.world.moveTo(p.runtime_entity_id, { x: p.x, y: p.y, z: p.z }))

    client.on('move_player', (p) => {
      if (String(p.runtime_id) !== String(this.selfRuntime)) {
        this.world.moveTo(p.runtime_id, p.position)
        return
      }
      // Der Server setzt uns um (Teleport, Korrektur): übernehmen.
      const feet = { x: p.position.x, y: p.position.y - EYE_HEIGHT, z: p.position.z }
      const jumped = dist(feet, this.controller.pos) > 2.5
      if (p.mode === 'teleport' || p.mode === 'reset' || jumped) {
        this.controller.setPosition(feet, { onGround: p.on_ground !== false })
      }
    })

    client.on('correct_player_move_prediction', (p) => {
      const feet = { x: p.position.x, y: p.position.y - EYE_HEIGHT, z: p.position.z }
      this.controller.setPosition(feet, { onGround: p.on_ground })
    })

    client.on('set_health', (p) => this.onHealth(p.health))
    client.on('update_attributes', (p) => {
      if (String(p.runtime_entity_id) !== String(this.selfRuntime)) return
      const hp = (p.attributes || []).find(a => a.name === 'minecraft:health')
      if (hp) this.onHealth(hp.current)
    })

    client.on('respawn', (p) => {
      if (String(p.runtime_entity_id) !== String(this.selfRuntime) && p.runtime_entity_id !== undefined) return
      // 0 = Suche nach Spawnpunkt, 1 = Server bereit -> wir antworten mit "bereit" (2)
      if (p.state === 0 || p.state === 1) {
        this.controller.setPosition({ x: p.position.x, y: p.position.y - EYE_HEIGHT, z: p.position.z })
        this.send(packets.respawnReady(this.selfRuntime, p.position))
        this.dead = false
        this.controller.paused = false
      }
    })

    client.on('player_hotbar', (p) => { this.hotbarSlot = p.selected_slot || 0; this.updateHeld() })
    client.on('inventory_content', (p) => {
      if (p.window_id === 'inventory' || p.window_id === 0) { this.hotbar = p.input || []; this.updateHeld() }
    })
    client.on('inventory_slot', (p) => {
      if (p.window_id === 'inventory' || p.window_id === 0) { this.hotbar[p.slot] = p.item; this.updateHeld() }
    })

    client.on('text', (p) => this.onText(p))
  }

  updateHeld () {
    const it = this.hotbar[this.hotbarSlot]
    this.heldItem = it && it.network_id ? it : null
  }

  onHealth (hp) {
    this.health = hp
    if (hp <= 0 && !this.dead) {
      this.dead = true
      this.controller.clearTask()
      this.controller.paused = true
      this.log('Ich bin gestorben. Starte neu ...')
      setTimeout(() => this.send(packets.requestRespawn(this.selfRuntime)), 1200)
    }
  }

  fmtPos (p) {
    return `${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}`
  }

  // ---------- Chat senden ----------

  say (text) {
    if (!text) return
    const clean = String(text).replace(/§./g, '').replace(/[\r\n]+/g, ' ').trim()
    for (let i = 0; i < clean.length; i += CHAT_MAX_LEN) {
      this.chatQueue.push(clean.slice(i, i + CHAT_MAX_LEN))
    }
    if (!this.chatTimer) {
      const flush = () => {
        const next = this.chatQueue.shift()
        if (next === undefined) { clearInterval(this.chatTimer); this.chatTimer = null; return }
        this.log('Ich sage:', next)
        this.send(packets.chat(this.client, next))
      }
      flush()
      this.chatTimer = setInterval(flush, CHAT_INTERVAL_MS)
    }
  }

  // ---------- Chat verstehen ----------

  onText (p) {
    if (!['chat', 'whisper', 'announcement'].includes(p.type)) return
    const sender = p.source_name
    const message = p.message
    if (!sender || !message || sameName(sender, this.cfg.username)) return

    const isOwner = !this.cfg.owner || sameName(sender, this.cfg.owner)
    const mentioned = rules.norm(message).includes(rules.norm(this.cfg.username))
    const ownerTalking = Boolean(this.cfg.owner) && isOwner && this.cfg.alwaysListenToOwner
    if (!mentioned && !ownerTalking) return

    if (this.pendingMessages >= 4) return // nicht zumüllen lassen
    this.pendingMessages++
    this.log(`${sender}: ${message}`)
    this.msgChain = this.msgChain
      .then(() => this.handleMessage(sender, message, isOwner, mentioned))
      .catch(e => this.log('Fehler bei Nachricht:', e.message))
      .finally(() => { this.pendingMessages-- })
  }

  // mentioned = der Spieler hat den Bot beim Namen genannt (sonst redet er vielleicht mit jemand anderem)
  async handleMessage (sender, message, isOwner, mentioned = true) {
    this.lastCommander = sender
    const ruleResult = rules.parse(message, {
      botName: this.cfg.username,
      knownPlayers: this.world.players().map(e => e.name),
      sender,
      lang: this.cfg.language
    })

    let reply = ruleResult.reply
    let intents = ruleResult.intents
    // Normales Geplauder des Besitzers mit anderen: nicht mit "versteh ich nicht" nerven.
    if (!intents.length && !mentioned) reply = null

    // STOPP gilt sofort – ohne auf die KI zu warten.
    const isStop = intents.length === 1 && intents[0].type === 'stop'

    if (!isStop && this.brain.available) {
      try {
        const out = await this.brain.think({
          sender,
          text: message,
          snapshot: this.snapshot(sender),
          allowActions: isOwner,
          addressed: mentioned
        })
        reply = out.reply
        intents = out.intents
      } catch (e) {
        this.log('KI nicht erreichbar, nutze eingebaute Befehle:', e.message)
      }
    }

    if (!isOwner) {
      if (!this.brain.available) {
        // Ohne KI können Fremde nichts Sinnvolles bekommen
        if (ruleResult.intents.length) this.say('Befehle darf nur mein Besitzer geben.')
        return
      }
      intents = [] // Fremde dürfen mit der KI nur plaudern
    }

    for (const it of intents) this.execute(it, sender, isOwner)
    if (reply) this.say(reply)
  }

  snapshot (sender) {
    const me = this.controller.pos
    const lines = []
    lines.push(`Dein Leben: ${this.health}/20. Deine Position: ${this.fmtPos(me)}.`)
    lines.push(`Aktuelle Aufgabe: ${this.controller.task ? this.controller.task.describe() : 'keine (du stehst still)'}.`)
    const near = [...this.world.entities.values()]
      .map(e => ({ e, d: dist(me, e.pos) }))
      .filter(x => x.d < 32)
      .sort((a, b) => a.d - b.d)
      .slice(0, 10)
      .map(({ e, d }) => `${e.isPlayer ? 'Spieler ' + e.name : e.type}${this.world.isHostile(e) ? ' (feindlich)' : ''} ${d.toFixed(0)} m`)
    lines.push(`In der Nähe: ${near.length ? near.join(', ') : 'niemand'}.`)
    const s = this.world.playerByName(sender)
    lines.push(s ? `${sender} steht ${dist(me, s.pos).toFixed(0)} m von dir entfernt bei ${this.fmtPos(s.pos)}.` : `${sender} ist gerade nicht in deiner Sichtweite.`)
    return lines.join('\n')
  }

  // ---------- Befehle ausführen ----------

  ctx () {
    return {
      me: () => ({ pos: this.controller.pos }),
      world: this.world,
      owner: () => this.world.playerByName(this.cfg.owner || this.lastCommander),
      say: (t) => this.say(t),
      cfg: this.cfg
    }
  }

  execute (intent, sender, isOwner = true) {
    const ctx = this.ctx()
    const c = this.controller
    switch (intent.type) {
      case 'stop':
        c.clearTask()
        break
      case 'come': {
        const p = this.world.playerByName(sender)
        if (!p) { this.say(`Ich sehe ${sender} gerade nicht – vielleicht bist du zu weit weg.`); break }
        c.setTask(new GotoTask(ctx, p.pos.x, p.pos.y, p.pos.z, 2))
        break
      }
      case 'follow':
        c.setTask(new FollowTask(ctx, intent.who || sender, 3))
        break
      case 'goto':
        if (![intent.x, intent.y, intent.z].every(Number.isFinite)) { this.say('Die Koordinaten verstehe ich nicht.'); break }
        c.setTask(new GotoTask(ctx, intent.x, intent.y, intent.z))
        break
      case 'attack':
        if (intent.kind === 'player') {
          if (!isOwner || !this.cfg.allowPlayerAttacks) {
            this.say('Gegen Spieler kämpfe ich nur, wenn "allowPlayerAttacks" in meiner Konfiguration an ist.')
            break
          }
          if (sameName(intent.name, this.cfg.username)) break
          c.setTask(new AttackTask(ctx, { kind: 'player', name: intent.name }))
        } else if (intent.kind === 'type') {
          c.setTask(new AttackTask(ctx, { kind: 'type', type: intent.mob }))
        } else {
          c.setTask(new AttackTask(ctx, { kind: 'hostiles' }))
        }
        break
      case 'guard':
        c.setTask(new GuardTask(ctx))
        break
      case 'jump':
        c.jump()
        break
      case 'look':
        c.setTask(new FollowTask(ctx, sender, 1e9)) // läuft nie, schaut nur
        break
      default:
        this.log('Unbekannter Befehl:', intent.type)
    }
  }

  // ---------- Kämpfen ----------

  attackEntity (target) {
    this.send(packets.swing(this.selfRuntime))
    const pkt = packets.attack(target, this.controller.pos, this.heldItem, this.hotbarSlot)
    try {
      this.client.queue(pkt[0], pkt[1])
    } catch (e) {
      // Falls das erfasste Item sich nicht erneut kodieren lässt: mit leerer Hand schlagen.
      this.heldItem = null
      this.send(packets.attack(target, this.controller.pos, null, this.hotbarSlot))
    }
  }
}

module.exports = { Bot }
