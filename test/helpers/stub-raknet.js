'use strict'
// Nur für Tests in Umgebungen ohne kompiliertes raknet-native:
// bedrock-protocol lädt das Modul beim Import fest. Wir ersetzen es durch eine leere Hülle
// und benutzen in den Tests das reine JS-RakNet (raknetBackend: 'jsp-raknet').
const Module = require('module')
const origLoad = Module._load
Module._load = function (request, ...rest) {
  if (request === 'raknet-native') {
    return { Client: class {}, Server: class {}, PacketPriority: {}, PacketReliability: {} }
  }
  return origLoad.call(this, request, ...rest)
}
