'use strict'
// Der Controller ist das "Nervensystem": 20x pro Sekunde fragt er die aktuelle Aufgabe,
// was sie will, bewegt den Bot ein Stück und schickt dem Server die passende Eingabe.
//
// Wichtig: Ohne Chunk-Daten kennt der Bot das Gelände nicht. Er läuft deshalb auf der Höhe,
// auf der er steht, und übernimmt Höhenkorrekturen, die der Server ihm schickt.

const { yawTo, pitchTo, approachAngle, dist2d } = require('./math')

const WALK = 0.21 // Blöcke pro Tick (Vanilla: ~0.216)
const SPRINT = 0.27 // (Vanilla: ~0.28)
const JUMP_VELOCITY = 0.42
const GRAVITY = 0.08
const ATTACK_COOLDOWN_TICKS = 10

class Controller {
  constructor ({ send, onAttack, log }) {
    this.send = send // (packet) => void, packet = [name, params]
    this.onAttack = onAttack // (entity) => void
    this.log = log || (() => {})
    this.pos = { x: 0, y: 0, z: 0 } // Füße
    this.yaw = 0
    this.pitch = 0
    this.vy = 0
    this.groundY = 0
    this.onGround = true
    this.sprinting = false
    this.tickNo = 0
    this.cooldown = 0
    this.task = null
    this.paused = true
    this.pendingJump = false
    this.timer = null
    this.buildInput = null // wird vom Bot gesetzt (packets.authInput)
  }

  setTask (task) {
    this.task = task
  }

  clearTask () {
    this.task = null
  }

  jump () {
    this.pendingJump = true
  }

  // Position/Blickrichtung vom Server übernehmen (Spawn, Teleport, Korrektur)
  setPosition (feet, { yaw, pitch, onGround = true } = {}) {
    this.pos = { x: feet.x, y: feet.y, z: feet.z }
    if (onGround) {
      this.groundY = feet.y
      this.vy = 0
      this.onGround = true
    }
    if (yaw !== undefined) this.yaw = yaw
    if (pitch !== undefined) this.pitch = pitch
  }

  start () {
    if (this.timer) return
    this.paused = false
    this.timer = setInterval(() => {
      try { this.tick() } catch (e) { this.log('Tick-Fehler:', e.message) }
    }, 50)
  }

  stop () {
    clearInterval(this.timer)
    this.timer = null
  }

  tick () {
    if (this.paused) return
    this.tickNo++
    if (this.cooldown > 0) this.cooldown--

    const intent = { moveTo: null, sprint: false, lookAt: null, jump: false, attack: null }
    if (this.task) {
      this.task.update(intent)
      if (this.task.done) this.task = null
    }

    const before = { ...this.pos }
    const eyeY = this.pos.y + 1.62

    // --- Blickrichtung ---
    let wantYaw = this.yaw
    let wantPitch = this.pitch
    let moving = false
    let heading = null
    if (intent.moveTo) {
      const dx = intent.moveTo.x - this.pos.x
      const dz = intent.moveTo.z - this.pos.z
      if (Math.hypot(dx, dz) > 0.05) {
        heading = yawTo(dx, dz)
        moving = true
      }
    }
    if (intent.lookAt) {
      const dx = intent.lookAt.x - this.pos.x
      const dz = intent.lookAt.z - this.pos.z
      if (Math.hypot(dx, dz) > 0.01) wantYaw = yawTo(dx, dz)
      wantPitch = pitchTo(dx, intent.lookAt.y - eyeY, dz)
    } else if (heading !== null) {
      wantYaw = heading
      wantPitch = 0
    }
    this.yaw = approachAngle(this.yaw, wantYaw, 70)
    this.pitch = Math.max(-90, Math.min(90, this.pitch + Math.max(-45, Math.min(45, wantPitch - this.pitch))))

    // Nur laufen, wenn wir schon ungefähr in Laufrichtung schauen (sonst läuft der Bot seitwärts
    // und der Server hält das für unmögliche Bewegung).
    if (moving && heading !== null) {
      const diff = Math.abs(((heading - this.yaw + 540) % 360) - 180)
      if (diff > 25) moving = false
    }

    // --- Laufen ---
    const wasSprinting = this.sprinting
    this.sprinting = moving && intent.sprint
    if (moving) {
      const speed = this.sprinting ? SPRINT : WALK
      const dx = intent.moveTo.x - this.pos.x
      const dz = intent.moveTo.z - this.pos.z
      const d = Math.hypot(dx, dz)
      const step = Math.min(speed, d)
      this.pos.x += (dx / d) * step
      this.pos.z += (dz / d) * step
    }

    // --- Springen / Schwerkraft ---
    let startJump = false
    if ((intent.jump || this.pendingJump) && this.onGround) {
      this.vy = JUMP_VELOCITY
      this.onGround = false
      startJump = true
    }
    this.pendingJump = false
    if (!this.onGround) {
      this.pos.y += this.vy
      this.vy = (this.vy - GRAVITY) * 0.98
      if (this.pos.y <= this.groundY) {
        this.pos.y = this.groundY
        this.vy = 0
        this.onGround = true
      }
    }

    // --- Zuschlagen ---
    if (intent.attack && this.cooldown === 0) {
      this.cooldown = ATTACK_COOLDOWN_TICKS
      try { this.onAttack(intent.attack) } catch (e) { this.log('Angriff fehlgeschlagen:', e.message) }
    }

    // --- Eingabe an den Server ---
    this.send(this.buildInput({
      pos: this.pos,
      yaw: this.yaw,
      pitch: this.pitch,
      moving,
      sprinting: this.sprinting,
      startSprint: this.sprinting && !wasSprinting,
      stopSprint: !this.sprinting && wasSprinting,
      jumping: !this.onGround && this.vy > 0,
      startJump,
      tick: this.tickNo,
      delta: { x: this.pos.x - before.x, y: this.pos.y - before.y, z: this.pos.z - before.z }
    }))
  }

  distanceTo2d (p) {
    return dist2d(this.pos, p)
  }
}

module.exports = { Controller, WALK, SPRINT }
