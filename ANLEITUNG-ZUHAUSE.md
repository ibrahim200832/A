# Anleitung: Den Bot zu Hause starten (Windows, Aternos)

## Das brauchst du
- Einen **eigenen PC/Laptop** mit Windows, auf dem du Programme installieren darfst
- Internet
- Deinen **Aternos-Server** (Software: **Bedrock**)
- Ein **zweites Microsoft-Konto** nur für den Bot (kostenlos auf account.microsoft.com, ohne Zahlungsdaten)

## 1. Node.js installieren (einmalig)
1. Auf https://nodejs.org den grünen **LTS**-Button anklicken und den Installer starten.
2. Überall auf „Weiter" klicken. Wenn die Frage kommt, setz den Haken bei **„Automatically install the necessary tools"**.
3. Alle schwarzen Fenster schließen. Dann Windows-Taste drücken, `cmd` tippen, Enter. Das ist das schwarze Fenster, das du ab jetzt benutzt.
4. Tipp `node -v` und Enter. Wenn eine Nummer wie `v22.…` kommt, hat es geklappt.

## 2. Den Bot holen
**Variante A (am einfachsten, ohne Git):**
1. Öffne im Browser: https://github.com/ibrahim200832/A/tree/claude/minecraft-bedrock-ai-agent-8nvhnq
2. Grüner Button **Code → Download ZIP**.
3. Die ZIP-Datei entpacken (Rechtsklick → „Alle extrahieren"), zum Beispiel nach `C:\Users\DEINNAME\A`.

**Variante B (mit Git):**
```
git clone -b claude/minecraft-bedrock-ai-agent-8nvhnq https://github.com/ibrahim200832/A.git
```

## 3. Programmteile installieren (einmalig)
Im schwarzen Fenster in den Ordner wechseln und installieren. Pfad anpassen!
```
cd C:\Users\DEINNAME\A
npm install
```
Das dauert ein paar Minuten, viel Text ist normal. Ein paar gelbe „warn"-Zeilen sind in Ordnung, rote Fehler nicht.

## 4. Einstellungen eintragen
```
copy config.example.json config.json
notepad config.json
```
Trag das hier ein (Anführungszeichen und Kommas nicht löschen!):

```
"host": "IBRAHIM124541.aternos.me",
"port": 19132,
"username": "KI-Bot",
"offline": false,
"owner": "DEIN-MINECRAFT-NAME",
```

- **port:** Schau auf der Aternos-Seite, ob hinter der Adresse eine Zahl steht (z. B. `41523`). Wenn ja, nimm die statt `19132`.
- **owner:** dein echter Spielername im Spiel, genau so geschrieben. Nur du darfst dem Bot Befehle geben.
- **offline** bleibt `false`, weil Aternos den Microsoft-Login verlangt.

Mit **Strg+S** speichern und Notepad schließen.

## 5. Aternos vorbereiten
1. Server auf **Start** drücken und warten, bis er **Online** ist.
2. Falls die **Whitelist** an ist: Trag dort den **Gamertag deines zweiten Microsoft-Kontos** ein (den Namen siehst du beim ersten Start des Bots).

## 6. Bot starten
```
npm start
```
- Beim ersten Mal zeigt der Bot einen **Link und einen Code**. Öffne den Link im Browser, gib den Code ein und melde das **zweite** Konto an.
- Danach joint der Bot deinem Server und schreibt „Hi! Ich bin da."

Beenden: im schwarzen Fenster **Strg + C**.

## 7. Im Spiel benutzen
Schreib im Chat zum Beispiel:
- `komm her`
- `folge mir`
- `beschütze mich`
- `greif Zombies an`
- `stopp`

## Optional: Claude als Gehirn (versteht freie Sätze)
Dafür brauchst du einen API-Key von console.anthropic.com. Das kostet Geld (nach Verbrauch). Ohne Key funktioniert der Bot trotzdem mit den festen Befehlen. Mit Key, vor dem Start im selben Fenster:
```
set ANTHROPIC_API_KEY=sk-ant-DEIN-KEY
npm start
```
Tipp: Schreib den Key niemals in eine Datei auf GitHub und gib ihn niemandem.

## Wenn etwas nicht klappt
| Was du siehst | Was du tust |
|---|---|
| `npm wird nicht erkannt` | Node.js fehlt, oder du hast das alte Fenster benutzt. Neues cmd-Fenster öffnen, `node -v` testen. |
| Beim `npm install` Fehler mit `cmake-js` oder `Visual Studio` | Node.js nochmal installieren, mit dem Haken bei „necessary tools". Alternativ „Visual Studio Build Tools" mit C++-Paket installieren. |
| `Unsupported version` oder Versionsfehler | In `config.json` bei `"version"` die Serverversion eintragen, z. B. `"1.21.50"`. |
| Zeitüberschreitung / keine Verbindung | Ist der Aternos-Server wirklich **Online**? Stimmt der Port? |
| „Nicht auf der Whitelist" | Gamertag des Bot-Kontos bei Aternos auf die Whitelist setzen. |
| Der Bot joint, reagiert aber nicht auf dich | `owner` in der config.json falsch geschrieben. Groß-/Kleinschreibung egal, aber sonst exakt. |
| Der Bot ruckelt oder läuft nicht richtig | Das ist der Teil, den ich ohne echten Server nicht testen konnte. Schick mir die Meldungen aus dem Fenster. |

## Gut zu wissen
- Der Bot sieht **keine Blöcke**. Er läuft geradeaus und bleibt an Wänden hängen. Am besten auf flachem Gelände ausprobieren.
- Er kann **nicht bauen oder abbauen**.
- Er greift **dich nie** an. Spieler greift er nur an, wenn du `"allowPlayerAttacks": true` einstellst und es ausdrücklich verlangst.
