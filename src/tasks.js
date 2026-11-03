'use strict'
// Aufgaben des Bots. Jede Aufgabe bekommt pro Tick (50 ms) die Chance, dem Controller zu sagen,
// was sie gerade will: laufen, rennen, irgendwohin schauen, springen oder zuschlagen.
//
// ctx = { me(): {pos}, world, owner(): Entity|null, say(text), cfg }

const { dist, dist2d } = require('./math')
const { EYE_HEIGHT } = require('./world')

const REACH = 3.0 // so weit darf zugeschlagen werden
const CLOSE_ENOUGH = 2.2 // so nah geht der Bot beim Kämpfen ran

// Mittelpunkt eines Ziels (grob Körpermitte)
function center (e) {
  return { x: e.pos.x, y: e.pos.y + (e.isPlayer ? 1.0 : 0.7), z: e.pos.z }
}

function eyeOf (me) {
  return { x: me.pos.x, y: me.pos.y + EYE_HEIGHT, z: me.pos.z }
}

// Ein Ziel bekämpfen: hinrennen, anschauen, in Reichweite zuschlagen.
function engage (ctx, target, intent) {
  const me = ctx.me()
  const c = center(target)
  intent.lookAt = c
  const d = dist(eyeOf(me), c)
  if (d > CLOSE_ENOUGH) {
    intent.moveTo = { x: target.pos.x, z: target.pos.z }
    intent.sprint = d > 4
  }
  if (d <= REACH) intent.attack = target
  return d
}

function followTarget (ctx, target, keep, intent) {
  const me = ctx.me()
  const d = dist2d(me.pos, target.pos)
  if (d > keep + 0.5) {
    intent.moveTo = { x: target.pos.x, z: target.pos.z }
    intent.sprint = d > keep + 6
  }
  // Wenn der andere nah ist, einfach anschauen
  if (d < 12) intent.lookAt = { x: target.pos.x, y: target.pos.y + 1.5, z: target.pos.z }
}

class GotoTask {
  constructor (ctx, x, y, z, radius = 1.2) {
    this.ctx = ctx
    this.target = { x, y, z }
    this.radius = radius
    this.done = false
    this.name = 'goto'
  }

  describe () { return `gehe zu ${Math.round(this.target.x)} ${Math.round(this.target.y)} ${Math.round(this.target.z)}` }

  update (intent) {
    const me = this.ctx.me()
    const d = dist2d(me.pos, this.target)
    if (d <= this.radius) {
      this.done = true
      this.ctx.say('Bin da.')
      return
    }
    intent.moveTo = { x: this.target.x, z: this.target.z }
    intent.sprint = d > 10
  }
}

class FollowTask {
  // name = null -> dem Besitzer folgen
  constructor (ctx, name, keep = 3) {
    this.ctx = ctx
    this.name = 'follow'
    this.who = name
    this.keep = keep
    this.done = false
    this.warned = false
  }

  describe () { return `folge ${this.who || 'dem Besitzer'}` }

  target () {
    return this.who ? this.ctx.world.playerByName(this.who) : this.ctx.owner()
  }

  update (intent) {
    const t = this.target()
    if (!t) {
      if (!this.warned) {
        this.warned = true
        this.ctx.say(`Ich sehe ${this.who || 'dich'} gerade nicht. Ich warte hier.`)
      }
      return
    }
    this.warned = false
    followTarget(this.ctx, t, this.keep, intent)
  }
}

class AttackTask {
  // selector: { kind: 'hostiles' } | { kind: 'type', type } | { kind: 'player', name }
  constructor (ctx, selector) {
    this.ctx = ctx
    this.name = 'attack'
    this.selector = selector
    this.done = false
    this.current = null
    this.idleTicks = 0
    this.kills = 0
  }

  describe () {
    const s = this.selector
    if (s.kind === 'player') return `kämpfe gegen ${s.name}`
    if (s.kind === 'type') return `bekämpfe ${s.type}`
    return 'bekämpfe Monster in der Nähe'
  }

  pick () {
    const { world } = this.ctx
    const me = this.ctx.me()
    const owner = this.ctx.owner()
    const notOwner = (e) => !owner || e.id !== owner.id
    const s = this.selector
    if (s.kind === 'player') return world.playerByName(s.name)
    if (s.kind === 'type') return world.nearest(me.pos, e => !e.isPlayer && e.type === s.type, 40)
    return world.nearest(me.pos, e => notOwner(e) && world.isHostile(e), 30)
  }

  update (intent) {
    const { world } = this.ctx
    if (this.current && !world.get(this.current.id)) {
      this.kills++
      this.current = null
    }
    if (!this.current) this.current = this.pick()

    if (!this.current) {
      this.idleTicks++
      if (this.idleTicks > 40) {
        this.done = true
        this.ctx.say(this.kills > 0 ? 'Erledigt!' : 'Ich sehe niemanden, den ich angreifen könnte.')
      }
      return
    }
    this.idleTicks = 0
    engage(this.ctx, this.current, intent)
  }
}

// Beschützen: dem Besitzer folgen und alles Feindliche in der Nähe angreifen.
class GuardTask {
  constructor (ctx) {
    this.ctx = ctx
    this.name = 'guard'
    this.done = false
    this.current = null
    this.lastAnnounce = 0
  }

  describe () { return 'beschütze den Besitzer' }

  threat () {
    const { world } = this.ctx
    const me = this.ctx.me()
    const owner = this.ctx.owner()
    const near = (e) => world.isHostile(e) && (
      dist(me.pos, e.pos) < 14 || (owner && dist(owner.pos, e.pos) < 14)
    )
    return world.nearest(me.pos, near, 30)
  }

  update (intent) {
    const { world } = this.ctx
    if (this.current && !world.get(this.current.id)) this.current = null
    if (!this.current) {
      this.current = this.threat()
      const now = Date.now()
      if (this.current && now - this.lastAnnounce > 15000) {
        this.lastAnnounce = now
        this.ctx.say(`Achtung, ${this.current.type.replace(/_/g, ' ')}! Ich kümmere mich drum.`)
      }
    }
    if (this.current) {
      engage(this.ctx, this.current, intent)
      return
    }
    const owner = this.ctx.owner()
    if (owner) followTarget(this.ctx, owner, 3, intent)
  }
}

module.exports = { GotoTask, FollowTask, AttackTask, GuardTask, engage, REACH, CLOSE_ENOUGH }
