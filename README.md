# Fortnite auf Temu

Ein Battle-Royale-Bauspiel im Browser. **Das ganze Spiel steckt in einer einzigen Datei: `index.html`.**
Three.js ist direkt eingebettet, es wird nichts aus dem Internet nachgeladen.

## Was drin ist

- **Lobby:** Name, Bot-Stärke (Leicht / Mittel / Schwer / Gemischt), Anzahl der Gegner (1–24), 6 Outfits und deine Statistik (Spiele, Siege, Eliminierungen); alles wird auf dem Gerät gespeichert
- **Battle Bus:** fliegt quer über die Insel, Absprung, freier Fall (Sturzflug möglich), Gleiter geht automatisch auf
- **24 Bots** mit drei Stärken: looten Truhen und Waffen, kämpfen auf passender Entfernung, weichen seitlich aus, bauen Wände wenn sie beschossen werden, heilen sich und laufen vor dem Sturm davon
- **Truhen** (goldenes Leuchten und Funkeln) und **Bodenloot** mit Lichtstrahl in der Seltenheitsfarbe
- **5 Waffen** in 5 Seltenheiten (Grau, Grün, Blau, Lila, Gold): Pistole, Maschinenpistole, Sturmgewehr, Schrotflinte, Scharfschützengewehr mit Zielfernrohr; Kopftreffer, Nachladen, Munitionsarten
- **Heilung:** Verband, Medikit, kleiner Schildtrank, Schildtrank; Leben + Schild
- **Sturm** in 5 Phasen mit Countdown, Schaden außerhalb, Minikarte und große Karte (M)
- **Bauen** mit Holz (Spitzhacke an Bäumen, Steinen, Kisten), Einsturz mit Kettenreaktion
- Killfeed, Trefferanzeige, Schadenszahlen, Fallschaden, Victory Royale / Platzierung
- **Grafik:** Himmel mit Sonne, Wolken, Wasser mit Wellen, weiche Schatten, Texturen, zwei Baumarten, Gras und Blumen
- Technik nach Abschnitt 1b: eigene Kollision und Raycasts (Three.js nur zum Rendern), Spatial Grid, fester 60-Hz-Tick mit Interpolation, Object Pooling, F3-Debug
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
| Feuer (beim Halten ziehen = zielen) | Linksklick | Schießen / Spitzhacke / Heilung benutzen |
| Zielen | Rechtsklick | Über Kimme bzw. Zielfernrohr zielen |
| Sprung | Leertaste | Springen, aus dem Bus springen, Gleiter öffnen |
| Aufheben | E | Truhe öffnen, Gegenstand aufheben/tauschen |
| Hotbar antippen | 1–5, Mausrad, F | Waffe/Heilung wählen, F = Spitzhacke |
| Nachladen | R | Nachladen |
| Bauen, dann Wand/Boden/Rampe/Dach | Q, dann 1–4 | Bauen (10 Holz pro Teil) |
| Ducken | C / Strg | Ducken |
| Minikarte antippen | M | Große Karte |
| F3 / ☰ | F3 / Esc | Debug / Pause |

Ruckelt es, im Pause-Menü **Grafik → Niedrig** wählen (ohne Schatten und Gras).

## Entwicklung

- `src/00-config.js` … `src/99-main.js` – Spielcode in Modulen; alle Werte stehen im `CONFIG`-Objekt in `00-config.js`
- `src/template.html` – HTML, CSS, HUD und Menüs
- `vendor/three.min.js` – Three.js r160 (MIT-Lizenz, siehe `vendor/THREE-LICENSE`)
- `node build.mjs` – packt alles in **eine** `index.html` und erzeugt die App-Icons

Nach jeder Änderung an `src/` einmal `node build.mjs` ausführen.
