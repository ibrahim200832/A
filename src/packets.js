'use strict'
// Alle Pakete, die der Bot SELBST an den Server schickt, werden hier gebaut.
// Das Bedrock-Protokoll ändert sich zwischen Versionen – diese Datei fängt die Unterschiede ab.

const { EYE_HEIGHT } = require('./world')

const EMPTY_ITEM = { network_id: 0 }

// Ab 1.26.40 ist input_data eine Liste von Namen, davor ein Bitfeld (Objekt mit true-Werten).
function inputData (client, names) {
  let asList = false
  try { asList = client.versionGreaterThanOrEqualTo('1.26.40') } catch { asList = false }
  if (asList) return names
  const flags = {}
  for (const n of names) flags[n] = true
  return flags
}

function chat (client, message) {
  return ['text', {
    needs_translation: false,
    category: 'authored',
    type: 'chat',
    source_name: client.username,
    message,
    xuid: '',
    platform_chat_id: '',
    has_filtered_message: false,
    filtered_message: ''
  }]
}

// state: { pos (Füße), yaw, pitch, moving, sprinting, jumping, startSprint, stopSprint, tick, delta }
function authInput (client, s) {
  const flags = []
  if (s.moving) flags.push('up')
  if (s.sprinting) flags.push('sprinting')
  if (s.startSprint) flags.push('start_sprinting')
  if (s.stopSprint) flags.push('stop_sprinting')
  if (s.jumping) flags.push('jump_down', 'jumping')
  if (s.startJump) flags.push('start_jumping')
  const forwardAxis = s.moving ? 1 : 0
  return ['player_auth_input', {
    pitch: s.pitch,
    yaw: s.yaw,
    position: { x: s.pos.x, y: s.pos.y + EYE_HEIGHT, z: s.pos.z },
    move_vector: { x: 0, z: forwardAxis },
    head_yaw: s.yaw,
    input_data: inputData(client, flags),
    input_mode: 'mouse',
    play_mode: 'normal',
    interaction_model: 'classic',
    interact_rotation: { x: s.pitch, z: s.yaw },
    tick: BigInt(s.tick),
    delta: s.delta,
    analogue_move_vector: { x: 0, z: forwardAxis },
    camera_orientation: { x: 0, y: 0, z: 1 },
    raw_move_vector: { x: 0, z: forwardAxis }
  }]
}

function swing (runtimeId) {
  return ['animate', {
    action_id: 'swing_arm',
    runtime_entity_id: runtimeId,
    data: 0,
    has_swing_source: false,
    hand: 'main_hand'
  }]
}

function attack (target, selfPos, heldItem, hotbarSlot) {
  const eye = { x: selfPos.x, y: selfPos.y + EYE_HEIGHT, z: selfPos.z }
  return ['inventory_transaction', {
    transaction: {
      legacy: { legacy_request_id: 0 },
      transaction_type: 'item_use_on_entity',
      actions: [],
      transaction_data: {
        entity_runtime_id: target.rawId,
        action_type: 'attack',
        hotbar_slot: hotbarSlot || 0,
        hand: 'main_hand',
        held_item: heldItem || EMPTY_ITEM,
        player_pos: eye,
        click_pos: { x: 0, y: 0, z: 0 }
      }
    }
  }]
}

// Klick auf "Wiederbeleben" im Todesbildschirm
function requestRespawn (runtimeId) {
  return ['player_action', {
    runtime_entity_id: runtimeId,
    action: 'respawn',
    position: { x: 0, y: 0, z: 0 },
    result_position: { x: 0, y: 0, z: 0 },
    face: 0
  }]
}

// Antwort auf das respawn-Paket des Servers (state 2 = client_ready)
function respawnReady (runtimeId, position) {
  return ['respawn', { position, state: 2, runtime_entity_id: runtimeId }]
}

module.exports = { chat, authInput, swing, attack, requestRespawn, respawnReady, inputData, EMPTY_ITEM }
