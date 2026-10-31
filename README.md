# Billard Freundesliga

Web-App für Billard mit Freunden: Matches eintragen, Elo-Rangliste, Spielerprofile mit Head-to-Head.

## Starten

```bash
npm install
npm run dev
```

## Befehle

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Produktions-Build nach `dist/` |
| `npm test` | Tests (Vitest) |
| `npm run lint` | Linting (oxlint) |

## Elo

Start bei 1200. Nach jedem Match: `R' = R + K · M · (S − E)` mit
`E = 1 / (1 + 10^((R_Gegner − R) / 400))`.

- K = 40 in den ersten 10 Matches, danach 24
- M = 1 + 0,5 · Framedifferenz / Race-to (deutliche Siege zählen mehr)

Die Wertungen werden immer aus der Match-Liste neu berechnet, daher bleibt alles konsistent, wenn ein Match gelöscht wird.

Die Daten liegen aktuell im `localStorage` des Browsers.
