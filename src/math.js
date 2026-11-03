'use strict'

// Bedrock-Konvention: yaw 0 = Blick Richtung +Z, yaw 90 = Richtung -X. pitch > 0 = nach unten.
const DEG = 180 / Math.PI
const RAD = Math.PI / 180

function normYaw (y) {
  y = y % 360
  if (y > 180) y -= 360
  if (y <= -180) y += 360
  return y
}

function yawTo (dx, dz) {
  return normYaw(Math.atan2(-dx, dz) * DEG)
}

function pitchTo (dx, dy, dz) {
  return -Math.atan2(dy, Math.hypot(dx, dz)) * DEG
}

function forward (yaw) {
  return { x: -Math.sin(yaw * RAD), z: Math.cos(yaw * RAD) }
}

function dist (a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

function dist2d (a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

// Dreht `cur` um höchstens `maxStep` Grad Richtung `target` (kürzester Weg).
function approachAngle (cur, target, maxStep) {
  const d = normYaw(target - cur)
  if (Math.abs(d) <= maxStep) return normYaw(target)
  return normYaw(cur + Math.sign(d) * maxStep)
}

module.exports = { DEG, RAD, normYaw, yawTo, pitchTo, forward, dist, dist2d, approachAngle }
