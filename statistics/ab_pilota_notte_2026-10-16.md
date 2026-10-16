# Test A/B — Recupero pilota e notte — 2026-10-16

Seguito di `simulazioni_2026-10-16.md` (problemi P1 e P2). Simulatore `tools/sim/`, stessi seed
per tutte le varianti (1–60 per il pilota, 1–80 per la notte). Le varianti sono iniettate con `--variant`, senza
modificare il codice del gioco. Il rumore statistico è circa ±6 punti a 60 partite. Come sempre il bot è più
debole di un umano: contano i **delta**, non le percentuali assolute.

## Recupero pilota (solo missione `rescue_pilot`, 60 partite per variante)

Varianti:
- **vc-25%**: `vcCount` ridotto del 25%.
- **noRinforzi**: niente rinforzi periodici (`reinforcementTurn = 99`).
- **pilotMid**: pilota spostato sul tile percorribile più vicino al 60% del tragitto partenza→pilota.
- **noConverge**: i VC in pattuglia non convergono sul pilota o sull'estrazione (vagano come in Ricerca e distruzione).
  Oggi tutti i VC non allertati marciano verso il pilota, in `ai.js:enemyActivation` (~riga 372).
- **mid+noConv**: pilotMid e noConverge insieme.

Vittorie % (tra parentesi i caduti medi):

| Mappa | base | vc-25% | noRinforzi | pilotMid | noConverge | mid+noConv |
|---|---|---|---|---|---|---|
| Giungla S | 15 (3.67) | 20 | 23 | **47** (2.55) | 25 | **73** (1.52) |
| Giungla M | 0 (3.97) | 7 | 8 | **18** (3.53) | 15 | **60** (2.05) |
| Città M | 5 (3.90) | 5 | 13 | **27** (3.30) | 17 | **47** (2.70) |
| Hue City | 0 (4.00) | 10 | 8 | **18** (3.62) | 5 | **27** (3.43) |
| Rung Sat | 20 (3.55) | 18 | 37 | **43** (3.03) | 30 | **82** (1.63) |

Conclusioni:
- Il problema non è il numero di VC: ridurli del 25% vale da 0 a +10 punti. Il peso viene dalla **geometria**: il pilota sta in fondo alla mappa e la squadra
  deve attraversarla due volte, con **tutti i VC che convergono sullo stesso punto**.
- **pilotMid** è la leva singola più forte e costante (+18…+32 su ogni mappa) e porta la missione
  al livello di Ricognizione e Conquista (18–24% di media col bot).
- **noConverge** aiuta (+5…+15), ma insieme a pilotMid diventa troppo facile su Rung Sat e
  Giungla S (73–82%, oltre il 56% di Ricerca e distruzione).
- **Raccomandazione:** spostare il pilota verso il centro (≈60% del tragitto) nei generatori
  (`mapGen.js`, `lzAt` / `crashAt`) e nei JSON di Hue e Rung Sat. Se serve un'altra spinta, si può
  rendere la convergenza parziale: solo i VC entro un certo raggio dal pilota, oppure solo dopo che il pilota è stato
  trovato. Questa via di mezzo non è ancora stata testata.

## Notte (Giungla M e Città M, `--night`, missioni a rotazione, 80 partite per variante)

Oggi di notte (`mechanics.js`) la visione US perde 2 tile (`NIGHT_VISION_PENALTY`) e
la distanza d'allerta/vista dei VC scende da 5 a 3. La gittata dei VC è però 2, quindi i VC
non perdono capacità di fuoco. Gli US invece scendono a visione 2 (assalto, geniere) o 1 (medico),
e da accucciati perdono un altro tile: **la squadra di notte è cieca, i VC no**.

Varianti:
- **pen1**: penalità notturna 1 per tutti (`nightVisionPenalty = 1`).
- **usPen1**: penalità 1 solo per gli US, VC invariati.
- **vcPen3**: VC con penalità 3 (allerta/vista 2), US invariati.
- **stanceNoVis**: la postura non riduce la visione (accucciato 0, sdraiato 1).
- **usPen1+vcPen3**: combinazione.

Vittorie % (giorno, stessa mappa e dimensione: Giungla M 24%, Città M 18%):

| Variante | Giungla M notte | Città M notte | Caduti (G / C) | Danno VC (G / C) |
|---|---|---|---|---|
| base | 3 | 8 | 3.90 / 3.85 | 38.4 / 35.6 |
| pen1 | 19 | 8 | 3.52 / 3.83 | 34.0 / 35.6 |
| **usPen1** | **26** | **15** | 3.26 / 3.67 | 31.4 / 33.5 |
| vcPen3 | 18 | 8 | 3.61 / 3.85 | 34.4 / 34.8 |
| stanceNoVis | 10 | 11 | 3.76 / 3.79 | 36.4 / 35.3 |
| usPen1+vcPen3 | 36 | 20 | 2.99 / 3.46 | 26.8 / 29.5 |

Conclusioni:
- La leva è la **visione US**: con penalità 1 solo per gli US, la notte torna vicina alla difficoltà
  diurna (26% contro 24% in giungla, 15% contro 18% in città) e la squadra spara di più (7.9 contro 5.0 colpi).
- Penalizzare solo i VC (vcPen3) aiuta in giungla ma non in città. Ha anche un effetto collaterale:
  con allerta 2 gli avvistamenti a distanza spariscono del tutto (spotted 0.0), quindi la furtività
  notturna perde senso.
- La combinazione rende la notte in giungla **più facile** del giorno (36% contro 24%): eccessivo.
- La postura pesa poco (stanceNoVis: +3…+7).
- **Raccomandazione:** separare la penalità notturna US da quella VC. Si può portare
  `NIGHT_VISION_PENALTY` a 1 per gli US e lasciare 2 per `vcAlertDistance`, con un campo mappa opzionale
  `vcNightPenalty` che segua il pattern di fallback di `nightVisionPenalty`.

## Implementazione e verifica

Implementate entrambe le raccomandazioni:
- `mapGen.js:_pilotSite`: il pilota sta al 60% del tragitto estrazione→LZ (giungla) o relitto (città),
  con il fumo sul suo tile. Usa un RNG separato, quindi a parità di seed il resto della mappa è identico.
  Nei JSON il pilota passa a Rung Sat (10,2)→(6,3) e a Hue City (7,2)→(7,5).
- `mechanics.js`: `NIGHT_VISION_PENALTY` = 1 per i soldati e nuovo `vcNightPenalty()` (default 2, campo
  mappa `vcNightPenalty`) per allerta e vista dei VC.

Simulazione con il codice modificato (stessi seed):

| Configurazione | Prima | Dopo |
|---|---|---|
| Pilota, Giungla S | 15% | 45% |
| Pilota, Giungla M | 0% | 15% |
| Pilota, Giungla L | 0% | 20% |
| Pilota, Città M | 5% | 32% |
| Pilota, Città L | 0% | 12% |
| Pilota, Hue City | 0% | 23% |
| Pilota, Rung Sat | 20% | 43% |
| Notte, Giungla M (giorno 26%) | 3% | 29% |
| Notte, Città M (giorno 18%) | 8% | 15% |

Il recupero pilota ora sta tra il 12% e il 45%, nella fascia di Ricognizione e Conquista.
La notte ha circa la difficoltà del giorno: in giungla risulta persino un filo più facile (29% contro 26%,
dentro il rumore statistico). Se al playtest la notte sembra troppo morbida, si può riportare
`vcNightPenalty` a 1 su singole mappe.
