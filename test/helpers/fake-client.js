'use strict'
require('./stub-raknet')
const { EventEmitter } = require('events')
const { createSerializer } = require('bedrock-protocol/src/transforms/serializer')
const Options = require('bedrock-protocol/src/options')

// Ein simulierter Bedrock-Client. Alles, was der Bot "sendet", wird mit dem ECHTEN
// Protokoll-Serializer der jeweiligen Version kodiert – ein falsch gebautes Paket fällt sofort auf.
class FakeClient extends EventEmitter {
  constructor (version = '1.26.45', username = 'KI-Bot') {
    super()
    this.username = username
    this.version = version
    this.options = { protocolVersion: Options.Versions[version] }
    this.serializer = createSerializer(version)
    this.sent = []
  }

  versionGreaterThanOrEqualTo (v) { return this.options.protocolVersion >= Options.Versions[v] }

  queue (name, params) {
    this.serializer.createPacketBuffer({ name, params }) // wirft bei ungültigem Paket
    this.sent.push({ name, params })
  }

  close () { this.emit('close') }

  of (name) { return this.sent.filter(p => p.name === name) }
  chats () { return this.of('text').map(p => p.params.message) }
}

function fakeBedrock (client) {
  return { createClient: () => client }
}

const OWNER_EYE = (x, y, z) => ({ x, y: y + 1.62, z })

// Packet-Fabriken, wie sie der Server schicken würde
const pkt = {
  startGame: (x = 0, y = 64, z = 0) => ({
    runtime_entity_id: 1n, entity_id: 1n, player_position: { x, y: y + 1.62, z }, rotation: { x: 0, z: 0 }
  }),
  addPlayer: (name, runtimeId, x, y, z) => ({
    runtime_id: BigInt(runtimeId), unique_id: BigInt(runtimeId), username: name, position: OWNER_EYE(x, y, z)
  }),
  addEntity: (type, runtimeId, x, y, z) => ({
    runtime_id: BigInt(runtimeId), unique_id: BigInt(runtimeId) + 1000n, entity_type: `minecraft:${type}`, position: { x, y, z }
  }),
  chat: (sender, message) => ({ type: 'chat', source_name: sender, message })
}

module.exports = { FakeClient, fakeBedrock, pkt }
