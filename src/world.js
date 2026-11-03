'use strict'
const { dist } = require('./math')

// Bei Spielern meldet Bedrock die Augenposition, bei Mobs die Füße.
const EYE_HEIGHT = 1.62

// Monster, die der Bot im Schutz-Modus von sich aus angreift.
const HOSTILE = new Set([
  'zombie', 'zombie_villager', 'husk', 'drowned', 'skeleton', 'stray', 'wither_skeleton',
  'creeper', 'spider', 'cave_spider', 'witch', 'pillager', 'vindicator', 'evoker', 'ravager',
  'vex', 'phantom', 'slime', 'magma_cube', 'silverfish', 'blaze', 'ghast', 'hoglin',
  'piglin_brute', 'zoglin', 'guardian', 'elder_guardian', 'endermite', 'shulker', 'warden',
  'breeze', 'bogged'
])

// Alles unter "minecraft:" wegnehmen: "minecraft:zombie" -> "zombie"
function shortType (t) {
  return String(t || '').replace(/^minecraft:/, '')
}

const key = (id) => String(id)

class World {
  constructor () {
    this.entities = new Map() // runtimeId -> Entity
    this.uniqueToRuntime = new Map()
  }

  clear () {
    this.entities.clear()
    this.uniqueToRuntime.clear()
  }

  addPlayer (p) {
    const e = {
      id: key(p.runtime_id),
      rawId: p.runtime_id,
      uniqueId: p.unique_id !== undefined ? key(p.unique_id) : null,
      type: 'player',
      name: p.username,
      isPlayer: true,
      pos: { x: p.position.x, y: p.position.y - EYE_HEIGHT, z: p.position.z }
    }
    this._put(e)
    return e
  }

  addEntity (p) {
    const e = {
      id: key(p.runtime_id),
      rawId: p.runtime_id,
      uniqueId: p.unique_id !== undefined ? key(p.unique_id) : null,
      type: shortType(p.entity_type),
      name: null,
      isPlayer: false,
      pos: { x: p.position.x, y: p.position.y, z: p.position.z }
    }
    this._put(e)
    return e
  }

  _put (e) {
    this.entities.set(e.id, e)
    if (e.uniqueId) this.uniqueToRuntime.set(e.uniqueId, e.id)
  }

  get (runtimeId) {
    return this.entities.get(key(runtimeId))
  }

  // pos ist die vom Paket gemeldete Position (bei Spielern Augenhöhe).
  // Einzelne Achsen dürfen fehlen (move_entity_delta schickt nur das, was sich ändert).
  moveTo (runtimeId, pos) {
    const e = this.get(runtimeId)
    if (!e) return null
    const off = e.isPlayer ? EYE_HEIGHT : 0
    if (pos.x !== undefined) e.pos.x = pos.x
    if (pos.y !== undefined) e.pos.y = pos.y - off
    if (pos.z !== undefined) e.pos.z = pos.z
    return e
  }

  removeByUnique (uniqueId) {
    const rid = this.uniqueToRuntime.get(key(uniqueId))
    if (rid === undefined) return null
    this.uniqueToRuntime.delete(key(uniqueId))
    const e = this.entities.get(rid)
    this.entities.delete(rid)
    return e || null
  }

  removeByRuntime (runtimeId) {
    const e = this.get(runtimeId)
    if (!e) return null
    this.entities.delete(e.id)
    if (e.uniqueId) this.uniqueToRuntime.delete(e.uniqueId)
    return e
  }

  playerByName (name) {
    if (!name) return null
    const n = String(name).toLowerCase()
    for (const e of this.entities.values()) {
      if (e.isPlayer && e.name && e.name.toLowerCase() === n) return e
    }
    return null
  }

  players () {
    return [...this.entities.values()].filter(e => e.isPlayer)
  }

  isHostile (e) {
    return !e.isPlayer && HOSTILE.has(e.type)
  }

  // Nächste Entity, die `filter` besteht, innerhalb von `maxDist` um `origin`.
  nearest (origin, filter, maxDist = Infinity) {
    let best = null
    let bestD = maxDist
    for (const e of this.entities.values()) {
      if (!filter(e)) continue
      const d = dist(origin, e.pos)
      if (d <= bestD) { best = e; bestD = d }
    }
    return best
  }
}

module.exports = { World, HOSTILE, EYE_HEIGHT, shortType }
