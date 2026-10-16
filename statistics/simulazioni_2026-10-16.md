# Simulazioni di giocabilità — 2026-10-16

Simulatore headless `tools/sim/` (bot standard, squadra assalto/cecchino/geniere/medico),
80 partite per configurazione, missioni a rotazione (20 per tipo), seed 1–80, limite 40 turni.
Totale 800 partite, nessun crash.

```
node tools/sim/run.js --map <jungle|urban> --size <small|medium|large> --games 80 --json …
node tools/sim/run.js --map <rung_sat|hue_city> --games 80 --json …
node tools/sim/run.js --map <jungle|urban> --size medium --night --games 80 --json …
```

> **Attenzione:** il bot è più debole e meno furtivo di un giocatore umano (vedi `stats.txt`:
> un umano ha subito 1 colpo in 9 turni, il bot ne subisce 5–8 a partita). I valori assoluti
> di vittoria **non** sono un verdetto di bilanciamento. Contano gli squilibri **relativi** tra
> mappe, dimensioni e tipi di missione. Il rumore statistico è circa ±10 punti su 20 partite e ±5 su 80.

## 1. Riepilogo per configurazione

| Configurazione | Vittorie | Squadra annientata | Turni | Caduti | VC uccisi | Colpi VC/partita | Prec. VC | Danno VC |
|---|---|---|---|---|---|---|---|---|
| Giungla S | 45% | 55% | 14.4 | 2.77 | 37% | 5.0 | 89% | 25.5 |
| Giungla M | 24% | 76% | 18.9 | 3.49 | 29% | 6.4 | 87% | 31.7 |
| Giungla L | 16% | 81% | 22.4 | 3.67 | 21% | 6.5 | 86% | 33.3 |
| Giungla M notte | **3%** | 98% | 16.3 | 3.90 | 14% | 8.4 | 85% | 38.4 |
| Città S | 40% | 60% | 13.5 | 2.99 | 46% | 5.6 | 84% | 26.1 |
| Città M | 18% | 83% | 14.5 | 3.54 | 30% | 7.0 | 85% | 32.5 |
| Città L | 13% | 88% | 17.0 | 3.76 | 24% | 7.2 | 85% | 32.3 |
| Città M notte | **8%** | 93% | 12.8 | 3.85 | 20% | 8.2 | 84% | 35.6 |
| Rung Sat | 31% | 69% | 18.2 | 3.34 | 51% | 6.4 | 85% | 29.8 |
| Hue City | 26% | 74% | 12.0 | 3.31 | 47% | 6.4 | 86% | 29.8 |

Timeout quasi nulli (3% solo in Giungla L) e nessuna partita "bloccata" (il fix del pilota tiene).
Le sconfitte arrivano tutte per **annientamento della squadra**, non per esaurimento dei turni.

### Per tipo di missione (tutte le mappe di giorno, 160 partite ciascuna)

| Missione | Vittorie | Turni | Caduti | Caduti nelle vittorie |
|---|---|---|---|---|
| Ricerca e distruzione | 56% | 17.6 | 2.57 | 1.44 |
| Conquista obiettivo | 24% | 13.7 | 3.42 | 1.64 |
| Ricognizione | 18% | 18.0 | 3.64 | 2.00 |
| Recupero pilota | **9%** | 16.2 | 3.81 | 1.79 |

## 2. Problemi individuati (in ordine di gravità)

### P1 — Recupero pilota quasi impossibile oltre la mappa piccola
0% di vittorie in Giungla M, Giungla L, Città M, Città L e Hue City; 10% in Giungla S, 25% in Città S e 35% a Rung Sat.
Le partite non si bloccano: la squadra viene logorata prima di arrivare al pilota.
Nel log di una partita a Hue (seed 2) la squadra non supera la metà della mappa in 16 turni.
Il pilota sta in fondo alla mappa, con l'estrazione all'altro capo, quindi la squadra percorre la
mappa due volte sotto il fuoco. Nelle mappe M/L la distanza cresce, ma l'attrito no.
**Da provare:** pilota più vicino al centro sulle mappe M/L, meno VC o rinforzi più tardivi
in questa missione, oppure un'estrazione alternativa più vicina al pilota.

### P2 — La notte è quasi ingiocabile
Giungla M: da 24% di giorno a 3% di notte; Città M: da 18% a 8%. Di notte la squadra spara
la metà (5.0 colpi contro 9.6), mentre i VC sparano di più (8.4 contro 6.4) e prendono più
fianchi e spalle (26%/13% contro 21%/12%). Visione ridotta e allerta VC sono sbilanciate:
i VC trovano la squadra più facilmente di quanto la squadra trovi loro.
**Da provare:** confrontare `vcAlertDistance` notturna con `unitVision` notturna. Anche i VC
potrebbero essere penalizzati al buio, nella LOS di `vcSees` oppure con un malus ATK notturno.

### P3 — Le dimensioni M/L scalano la difficoltà più del previsto
Giungla: 45%, 24%, 16%; Città: 40%, 18%, 13%. I VC totali salgono da ~14 a ~25–33,
mentre la squadra resta di 4 uomini con munizioni ed HP fissi. Il turno medio in più espone la squadra a
più attivazioni VC, a più rinforzi e a più emorragie. Il calo dovuto a M/L è maggiore
della differenza tra Ricognizione e Ricerca e distruzione.
**Da provare:** scalare `vcCount` e rinforzi meno che linearmente con l'area (oggi `_procScale.area`).
In alternativa si possono aggiungere risorse alla squadra sulle mappe grandi, come un caricatore o una radio.

### P4 — Il combattimento è molto letale e la copertura conta poco
La precisione dei VC è dell'**84–89%** (in linea con l'attesa teorica, quindi non è un bug)
e ogni colpo VC fa in media **4.8 HP**, contro HP di 7–10 per soldato: in media 2 colpi uccidono.
Con ATK 2 contro DEF 1 + copertura 1–2 + 1d6, la copertura sposta poco la probabilità di essere colpiti.
Ne segue che il primo contatto decide spesso la partita: il 50% delle sconfitte (232 su 467)
avviene con meno del 30% dei VC eliminati.
**Da provare (A/B):** copertura "pesante" che riduce anche il danno (es. −1 per punto) oppure
VC base ATK 1. Misurare con `--variant` la precisione VC e i caduti.

### P5 — L'emorragia è una causa di morte di primo piano
**31%** dei caduti muore dissanguato (fino al 43% in Ricerca e distruzione, Giungla M).
Il danno medio da emorragia è di 5.6 HP a partita, contro 30 HP di danno diretto dai VC.
Il medico cura in media solo 1.5 HP a partita e il primo soccorso si usa 0.3 volte.
Quando il medico muore o è lontano, l'emorragia trasforma ogni ferito in un caduto quasi certo.
**Da provare:** emorragia che si ferma da sola con una certa probabilità, oppure
primo soccorso utilizzabile anche se il medico è vivo ma lontano. Va verificato prima che il bot
non sottoutilizzi il medico: è un limite noto del bot, che cura solo compagni adiacenti.

### P6 — Grande divario tra Ricerca e distruzione sulle mappe fisse
Hue City: 85% in Ricerca e distruzione, in 8 turni. Rung Sat: **0%** in Ricerca e distruzione,
con il 59% dei VC uccisi e 24.6 turni. A Rung Sat i VC sono tanti (17.5 contro 12.8) e
la squadra esaurisce gli HP prima di finirli. A Hue, invece, la missione finisce prima che arrivino i rinforzi.
**Da provare:** rivedere `vcCount`/`reinforcementCount` per la Ricerca e distruzione di Rung Sat,
oppure rendere la condizione di vittoria una percentuale dei VC uccisi.

### P7 — Strumenti tattici quasi inutilizzati (in parte limite del bot)
Per partita si registrano 0.2 colpi d'overwatch, 0.1 soppressioni, 0.2 uccisioni col coltello, 0.4 esplosivi US e 0.3 tunnel sigillati.
L'overwatch del cecchino viene armato spesso ma scatta raramente: il cono frontale e il
movimento VC fuori vista lo rendono poco redditizio. Le uccisioni col coltello sono rare
anche perché il bot non cerca il corpo a corpo.
**Da verificare con playtest umano** prima di intervenire. Se confermato, conviene allargare
il cono dell'overwatch o dare +1 AP di reazione.

## 3. Cose che funzionano

- **Munizioni:** nelle vittorie restano 4–12 caricatori di riserva e quasi nessuna arma vuota.
  Il sistema munizioni non crea attrito eccessivo. I valori a 0 nelle sconfitte dipendono dai morti,
  perché si contano solo i sopravvissuti.
- **Precisione reale = attesa** su entrambi i lati (89/89% US, 86/86% VC): le anteprime delle
  probabilità sono affidabili.
- **Aggiramento VC:** il 20–30% dei colpi VC arriva dal fianco e l'8–19% alle spalle,
  quindi l'IA di aggiramento è attiva su tutte le mappe.
- **Fuoco amico** quasi nullo (0.0–0.1 HP a partita) e **trappole** contenute (1–2.5 HP a partita).
- Nessuna partita bloccata e nessun errore di esecuzione in 800 partite.

## 4. Prossimi passi suggeriti

1. Test A/B sul recupero pilota (P1) e sulla notte (P2): sono gli squilibri più grandi e
   probabilmente si sistemano con parametri di mappa, senza toccare le regole.
2. Test A/B sulla letalità (P4) con `--variant`, misurando caduti e "sconfitte al primo contatto".
3. Playtest umano mirato su overwatch ed emorragia (P5, P7), per distinguere i limiti
   del bot dai problemi di regole.
