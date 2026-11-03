# Minecraft Bedrock KI-Bot

Ein Bot-Spieler für **Minecraft Bedrock Edition**. Er joint wie ein ganz normaler Spieler deinem Server und kann:

- **sich bewegen** – zu dir kommen, dir folgen, zu Koordinaten laufen, springen, dich anschauen
- **kämpfen** – Monster angreifen, dich beschützen (Bodyguard-Modus), auf Wunsch auch Spieler
- **im Chat schreiben** – er antwortet und sagt, was er gerade macht
- **verstehen, was du schreibst** – mit Claude als Gehirn auch bei freien Sätzen, ohne API-Key zumindest die wichtigsten Befehle auf Deutsch und Englisch

## Schnellstart

Du brauchst [Node.js](https://nodejs.org) ab Version 18.

```bash
npm install
cp config.example.json config.json   # dann config.json öffnen und anpassen
npm start
```

In `config.json` musst du mindestens eintragen:

| Feld | Bedeutung |
|---|---|
| `host`, `port` | Adresse deines Servers (Standard-Port: `19132`) |
| `owner` | **Dein Spielername.** Nur du darfst dem Bot Befehle geben. |
| `username` | Wie der Bot im Spiel heißt |
| `offline` | `true` = ohne Microsoft-Login (siehe unten), `false` = mit Login |

### Wie kommt der Bot auf deinen Server?

**A) Eigener Bedrock-Server (am einfachsten).** Trag in der `server.properties` `online-mode=false` ein und starte den Server neu. Dann reicht `"offline": true`.

**B) Server mit Xbox-Pflicht** (Hoster, LAN-Welten und alles, was `online-mode=true` hat). Setz `"offline": false`. Beim ersten Start zeigt der Bot im Terminal einen Link und einen Code. Damit meldest du ein **zweites Microsoft-Konto** für den Bot an (nicht dein eigenes, du bist ja schon im Spiel). Das Login wird in `.bedrock-auth/` gespeichert. Im Spiel heißt der Bot dann wie dieses Konto (Gamertag), nicht wie bei `username`. Wenn der Server eine Whitelist hat, muss dieser Gamertag dort eingetragen sein.

Realms werden von diesem Projekt nicht direkt unterstützt.

Die Serverversion erkennt der Bot automatisch. Wenn das mal nicht klappt, trag sie bei `version` ein, z. B. `"1.21.50"`.

### Claude aktivieren (damit er dich wirklich versteht)

```bash
export ANTHROPIC_API_KEY=sk-ant-...      # Windows (PowerShell): $env:ANTHROPIC_API_KEY="sk-ant-..."
npm start
```

Ohne Key funktioniert der Bot trotzdem, dann aber nur mit den festen Befehlen unten. Mit Key versteht er auch Sätze wie *„Ey, räum mal die Creeper da hinten weg"* oder *„wie viel Leben hast du noch?"* und plaudert ein bisschen mit.

Standardmodell ist `claude-opus-5-5`. Wenn dir die Antworten zu langsam oder zu teuer sind, nimm ein kleineres, z. B. `CLAUDE_MODEL=claude-haiku-5-5`.

## Was du ihm schreiben kannst

Im Spielchat. Du musst seinen Namen nicht sagen, solange du der `owner` bist (mit `"alwaysListenToOwner": false` änderst du das).

| Du schreibst | Der Bot |
|---|---|
| `komm her` | läuft zu dir |
| `folge mir` / `komm mit` / `folge Alex` | folgt dir oder dem genannten Spieler |
| `beschütze mich` | bleibt bei dir und greift Monster an, die in die Nähe kommen |
| `greif Zombies an` / `töte die Spinne` / `greif alle Monster an` | kämpft gegen das Genannte |
| `geh zu 100 64 -20` | läuft zu den Koordinaten |
| `spring` · `schau mich an` | tut genau das |
| `stopp` | hört sofort auf (das geht auch dann sofort, wenn Claude gerade nachdenkt) |

Englisch geht auch (`follow me`, `attack zombies`, `stop` …).

## Sicherheit

- **Nur der `owner` kann Befehle geben.** Andere Spieler können mit Claude höchstens plaudern.
- Der Bot **greift dich nie von sich aus an** und im Bodyguard-Modus **nie Spieler**.
- Gegen **Spieler** kämpft er nur, wenn du `"allowPlayerAttacks": true` setzt *und* es ausdrücklich verlangst (z. B. für Duelle).
- Ist `owner` leer, kann jeder Befehle geben, der den Namen des Bots schreibt. Der Bot warnt dich beim Start davor.
- Wenn der Bot stirbt, respawnt er selbstständig.

## Wo die Grenzen sind (bitte ehrlich lesen)

- **Er sieht keine Blöcke.** Der Bot kennt die Spielwelt nur als „Spieler und Mobs in der Nähe", nicht das Gelände. Er läuft **geradeaus** zum Ziel, hält die Höhe, auf der er steht, und übernimmt Korrekturen vom Server. Auf flachem Gelände klappt das gut. Vor Wänden, Bergen, Wasser oder Löchern kommt er nicht weiter. Pfadfindung wäre der nächste große Schritt (siehe unten).
- **Bauen, Abbauen, Inventar, Handeln** kann er nicht.
- **Ruckeln/Zurücksetzen?** Bei Servern mit strenger Bewegungsprüfung kann der Server den Bot zurückziehen. Auf deinem eigenen Server hilft es meist, die Bewegung in der `server.properties` großzügiger einzustellen (Option `server-authoritative-movement`, z. B. auf `client-auth`; der genaue Name hängt von der Serverversion ab).
- **Getestet** ist alles mit simulierten Servern und einem echten `bedrock-protocol`-Server (Login, Verschlüsselung, Chat in beide Richtungen, jedes Paket gegen das echte Protokoll geprüft, für Version 1.26 und 1.21). **Gegen einen originalen Mojang-Bedrock-Server** konnte ich es in meiner Entwicklungsumgebung nicht laufen lassen. Rechne also damit, dass du bei Bewegung und Kampf an einer Stelle nachjustieren musst. Schreib mir dann einfach, was passiert.
- Der Claude-Teil ist nur mit einem simulierten SDK getestet, nicht mit einem echten API-Aufruf.

## Aufbau

```
src/
  index.js       Start, liest config.json
  bot.js         Verbindung, Pakete, Chat, führt Befehle aus
  controller.js  20 Ticks pro Sekunde: Laufen, Springen, Schwerkraft, Zuschlagen
  tasks.js       Aufgaben: hingehen, folgen, angreifen, beschützen
  rules.js       Befehle verstehen ohne KI (Deutsch/Englisch)
  brain.js       Claude: Chat verstehen, Werkzeuge aufrufen
  packets.js     Alle Pakete, die der Bot sendet (versionsabhängig)
  world.js       Merkt sich Spieler und Mobs in der Nähe
test/            94 Tests (npm test)
```

## Tests

```bash
npm test
```

**Zur Installation:** `bedrock-protocol` zieht `raknet-native` nach. Das lädt normalerweise fertige Programmteile herunter. Klappt das bei dir nicht (Fehlermeldung mit `cmake-js` beim `npm install`), brauchst du Build-Werkzeuge: unter Windows die „Visual Studio Build Tools" (C++), unter Linux `build-essential` und `cmake`. Meine Tests lasse ich in einer Umgebung ohne dieses Modul laufen, deshalb ersetzen sie es durch eine leere Hülle (`test/helpers/stub-raknet.js`) und nutzen das reine JavaScript-RakNet. Für den echten Betrieb brauchst du das nicht zu tun.

## Nächste Schritte

1. **Gelände lesen** (Chunk-Daten auswerten) → echtes Pfadfinden, Hindernisse umgehen, Klettern, Wasser meiden
2. Waffen automatisch wählen, essen, wenn der Hunger niedrig ist
3. Mehr Werkzeuge für Claude (z. B. Items aufheben, Kisten öffnen)
