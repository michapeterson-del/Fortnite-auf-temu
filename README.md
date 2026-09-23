# Fortnite auf Temu

Ein Battle-Royale-Bauspiel im Browser. **Das ganze Spiel steckt in einer einzigen Datei: `index.html`.**
Three.js ist direkt eingebettet, es wird nichts aus dem Internet nachgeladen.

## Stand: Phase 1 – Engine-Grundlage

- Insel mit Hügeln, Strand, dem See „Nebelsee“, 14 Häusern mit Tür und Fenster, Bäumen, Steinen und Kisten
- Laufen, Sprinten, Ducken, Springen, Schulterkamera mit Kollision
- Bauen: Wand, Boden, Rampe und Dach auf einem 5-m-Raster; Einsturz mit Kettenreaktion
- Spitzhacke gegen Bauteile und Trainingspuppen, mit Kopf- und Körpertreffern
- Technik nach Abschnitt 1b:
  - eigene Kollision (Kapsel gegen AABB, Substeps ≤ 0,2 m)
  - Spatial Hash Grid mit 8-m-Zellen
  - 3D-DDA-Raycasts mit Slab-Test, Terrain-Raycast mit Binärsuche
  - fester 60-Hz-Tick mit Interpolation
  - Object Pooling
  - F3-Debug-Anzeige
- **Touch-Steuerung fürs iPad**, dazu Tastatur und Maus

## Auf dem iPad spielen

> Wichtig vorab: Ob du das Spiel über einen Link oder als Datei öffnest, macht es **nicht schneller oder langsamer**.
> Das Spiel läuft in beiden Fällen komplett auf dem iPad. Ein Link liefert die Datei nur einmal aus.
> Wie flüssig es läuft, hängt nur vom iPad und der Grafik-Einstellung im Pause-Menü ab.

### Weg 1 (empfohlen): als App auf dem Home-Bildschirm, danach offline

1. Das Spiel **einmal** in Safari über eine Adresse öffnen, z. B. über GitHub Pages:
   Repository → *Settings* → *Pages* → Branch auswählen → Speichern.
   (Bei privaten Repositories braucht GitHub Pages ein kostenpflichtiges Konto.)
2. In Safari auf **Teilen → „Zum Home-Bildschirm“** tippen.
3. Das Spiel über das neue Symbol starten. Es läuft dann im **Vollbild ohne Safari-Leiste**.
4. Ab jetzt ist es im Speicher des iPads (`sw.js`) und startet **auch ohne Internet**.

### Weg 2: vom Computer im Heim-WLAN (ohne Internet-Link)

Auf dem Computer im Projektordner:

```bash
python3 -m http.server 8000
```

Auf dem iPad in Safari `http://<IP-des-Computers>:8000` öffnen (die IP steht in den Netzwerk-Einstellungen des Computers).
Das läuft nur im eigenen WLAN, es gibt keinen öffentlichen Link.

### Weg 3: nur die Datei

`index.html` in die Dateien-App legen, z. B. per AirDrop.
**Achtung:** Die Vorschau der Dateien-App führt kein JavaScript aus, das Spiel startet dort also nicht.
Du brauchst eine App, die HTML-Dateien mit JavaScript anzeigen kann, zum Beispiel einen Code-Editor mit Web-Vorschau.
Auf Mac und PC reicht ein Doppelklick auf `index.html`.

## Steuerung

| iPad (Touch) | Tastatur/Maus | Aktion |
|---|---|---|
| linke Bildschirmhälfte ziehen | WASD | Laufen (Joystick ganz raus = Sprinten) |
| rechte Hälfte wischen | Maus | Umsehen |
| Sprung | Leertaste | Springen |
| Ducken | C (umschalten) / Strg (halten) | Ducken |
| Bauen / Kampf | Q | Bau-Modus an/aus |
| Wand / Boden / Rampe / Dach | 1–4, Mausrad | Bauteil wählen |
| großer Knopf (halten) | Linksklick (halten) | Bauen bzw. Spitzhacke |
| F3 | F3 | Debug-Anzeige |
| ☰ | Esc / P | Pause und Einstellungen |

Ruckelt es, im Pause-Menü **Grafik → Niedrig** wählen.

## Entwicklung

- `src/game.js` – Spielcode; alle Werte stehen im `CONFIG`-Objekt ganz oben
- `src/template.html` – HTML, CSS, HUD und Menüs
- `vendor/three.min.js` – Three.js r160 (MIT-Lizenz, siehe `vendor/THREE-LICENSE`)
- `node build.mjs` – baut daraus `index.html` sowie die App-Icons

Nach jeder Änderung an `src/` einmal `node build.mjs` ausführen.
