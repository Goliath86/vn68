# VIETNAM '68 — Vietnam Wargame

Un wargame tattico a turni ambientato nella Guerra del Vietnam, giocabile interamente nel browser senza installazioni.

---

## Il Gioco

Comandi una squadra di soldati americani in operazioni speciali nel Vietnam del 1968. Ogni missione si svolge su una mappa a griglia con terreni diversi, obiettivi specifici e forze nemiche Vietcong (VC) che reagiscono alle tue mosse.

Scegli la mappa, scegli il tipo di missione e portala a termine prima che la tua squadra venga eliminata. Il progresso viene **salvato automaticamente** ad ogni turno: puoi chiudere il browser e riprendere da dove avevi lasciato.

---

## Come avviare

Il gioco richiede un server HTTP locale per caricare i file JSON (mappe, traduzioni, config). **Non funziona aprendo `index.html` direttamente come `file://`.**

Opzioni rapide:

```bash
# Node.js
npx serve .

# Python 3
python -m http.server 8080

# VS Code
# Estensione "Live Server" → tasto destro su index.html → Open with Live Server
```

Aprire poi il browser su `http://localhost:3000` (o la porta indicata dal server scelto).

---

## Regole

### Struttura del turno

Ogni round è diviso in due fasi:

1. **Fase Giocatore** — muovi e fai agire ogni unità della tua squadra
2. **Fase Nemica** — i VC si muovono e attaccano autonomamente

Il numero del turno corrente e i VC rimasti sono sempre visibili nell'header.

---

### Action Points (AP)

Ogni unità dispone di **3 AP per turno**. Le azioni consumano AP:

| Azione | Costo |
|---|---|
| Muovere (1 passo) | variabile (vedi terreno) |
| Attaccare | 1 AP |
| Abilità speciale | 1 AP (una volta per turno) |

Premi **Fine Turno** per passare alla fase nemica quando hai terminato.

---

### Terreno e Movimento

Il costo di movimento dipende dal tipo di terreno attraversato:

| Terreno | Costo AP | Copertura |
|---|---|---|
| Giungla | 2 | +2 |
| Palude | 3 | +1 |
| Radura / Sentiero / Villaggio | 1 | 0–1 |
| Guado | 2 | 0 |
| Bunker VC | 1 | +3 |
| Fiume / Ostacolo | — | Impassabile |
| Tile in fiamme | — | Impassabile (2 turni) |

La **copertura** aumenta la difesa dell'unità che occupa la cella, rendendo più difficile colpirla.

---

### Combattimento

Quando attacchi, il gioco ti chiede di **lanciare fisicamente il dado** premendo il pulsante dado. Il nemico invece lancia automaticamente.

**Formula di risoluzione (attacco singolo):**

```
Tiro attacco  = 2d6 + valore ATK dell'attaccante
Tiro difesa   = DEF difensore + copertura terreno + 1d6
Danno         = max(0, tiro attacco − tiro difesa)
```

Il danno viene sottratto agli HP del difensore. Se gli HP scendono a 0, l'unità viene eliminata.

L'attacco è possibile solo entro la **gittata** dell'unità. Se il nemico è fuori gittata, l'attacco fallisce.

Il **cecchino** subisce una penalità crescente all'ATK in base alla distanza dal bersaglio:

| Distanza | Penalità ATK |
|---|---|
| 1–2 tile | nessuna |
| 3–4 tile | −1 |
| 5–6 tile | −2 |

Il valore ATK minimo è sempre 1, anche con la penalità massima. La penalità compare nel log di combattimento solo quando applicata.

### Selezione arma e attacchi AoE

Alcune unità dispongono di **più armi**. Premendo "Attacca" compare un selettore con le armi disponibili e le munizioni rimanenti.

**Armi ad area (AoE):** granate, RPG e simili colpiscono tutti i bersagli in un raggio attorno al punto d'impatto. Il flusso è diverso:

1. Scegli l'arma AoE dal selettore
2. Tutti i tile entro la gittata si illuminano in arancione
3. Click sul tile bersaglio → anteprima del raggio d'effetto
4. **Conferma** o **Annulla** l'esplosione

Le armi AoE si risolvono con un singolo tiro di dado automatico applicato a tutti i bersagli nell'area — non è richiesto il dado manuale. L'esplosione colpisce sia VC che soldati US che si trovano nel raggio.

**Munizioni:** le armi con munizioni limitate mostrano il numero rimanente (es. `×2`). Quando le munizioni si esauriscono, l'arma non appare più nel selettore.

---

### Unità della Squadra

La squadra è composta da 4 soldati, uno per classe:

| Classe | HP | Movimento | ATK | DEF | Gittata | Abilità Speciale |
|---|---|---|---|---|---|---|
| **Assalto** | 10 | 4 | 3 | 1 | 2 | Fuoco Soppressivo · **Granate ×2** (AoE, ATK5, gittata 3) |
| **Cecchino** | 7 | 3 | 4 | 0 | 6 | Overwatch (attacca nemici in movimento) — **1 sparo per turno** |
| **Geniere** | 9 | 3 | 2 | 1 | 2 | Demolizione (bunker/ostacoli, dado ≥4) · Incendio (vegetazione, immediato) |
| **Medico** | 8 | 3 | 1 | 1 | 1 | Primo Soccorso (cura un alleato adiacente) — **ripristina il morale** |

> L'assalto ha sempre il fucile M16 come arma primaria (illimitata) più 2 granate. Premendo "Attacca" appare il selettore arma.

---

### Morale e Panico

Quando un soldato US scende **sotto il 30% degli HP** a causa di un attacco nemico, entra in stato di **panico** (SCOSSO):

- **−1 AP per turno** (da 3 a 2)
- **Abilità speciale bloccata**
- Bordo rosso pulsante sull'unità sulla mappa
- Tag **SCO** rosso nella lista squadra

Il soldato rimane scosso finché il **medico** non lo cura riportandolo sopra la soglia del 30% HP — a quel punto il morale viene ripristinato e le penalità scompaiono.

> Tenere il medico operativo non è solo per sopravvivere: è l'unico modo per riportare in piena efficienza un soldato sotto shock.

---

### Nemici Vietcong

I VC si muovono e attaccano automaticamente durante la fase nemica. Il loro spostamento è animato con una transizione fluida, rendendo il turno nemico leggibile a colpo d'occhio. Esistono tre varianti:

| Tipo | Comportamento |
|---|---|
| Guerrigliero | Unità base, ATK 2 (AK-47), gittata 2 — uno per missione porta anche RPG-7 (ATK 4, gittata 4, AoE, 1 colpo) |
| Cecchino VC | Pericoloso a distanza, ATK 3 (Mosin), gittata 4 |
| Comandante VC | Più resistente e mobile, ATK 3 (TT-33), DEF 1 |

**Armi speciali VC:** un solo guerrigliero per missione può essere equipaggiato con un RPG-7 (1 colpo). Una volta a tiro, lo usa quando la squadra è raggruppata o quando il bersaglio è fuori gittata dell'AK-47.

**Comportamento pattuglia:** finché non avvistano un soldato US (raggio 5), i VC pattugliano attivamente in base alla missione in corso:

| Missione | Pattuglia VC |
|---|---|
| **Search & Destroy** | Si spostano casualmente nelle vicinanze |
| **Recupero Pilota** | Convergono verso il pilota abbattuto; se già trovato, si dirigono al punto di estrazione per intercettare la squadra |
| **Ricognizione** | Esplorano l'intera mappa verso posizioni casuali |
| **Conquista Obiettivo** | Presidiano l'obiettivo più vicino |

**Propagazione dell'allerta:** quando un VC avvista la squadra, avvisa automaticamente tutti i compagni entro raggio 4. I VC allertati per propagazione reagiscono nello stesso turno, rendendo ogni contatto potenzialmente un'imboscata di gruppo.

**Uso tattico della copertura:** una volta allertati, i VC non avanzano in linea retta ma scelgono percorsi che privilegiano giungla, bunker e terreni coperti rispetto a radure e strade esposte. Tenersi al riparo non basta — il nemico cercherà attivamente di fare lo stesso.

Dal turno configurato nella mappa possono arrivare **rinforzi VC** periodici — sempre guerriglieri, sempre dallo stesso lato.

In aggiunta, ogni mappa ha un'**imboscata a sorpresa**: a un turno preciso (e una sola volta), un gruppo di VC emerge da una direzione inattesa — fianco o retro rispetto all'obiettivo — con unità di qualità superiore e già in stato di allerta. Il turno esatto non è comunicato al giocatore in anticipo.

---

### Tipi di Missione

Per ogni mappa puoi scegliere tra i tipi di missione disponibili:

| Missione | Obiettivo |
|---|---|
| **Ricognizione** | Raggiungere con almeno un soldato tutte le zone indicate |
| **Search & Destroy** | Eliminare il numero richiesto di VC (o tutti) |
| **Recupero Pilota** | Localizzare il pilota abbattuto e scortarlo al punto di estrazione |
| **Conquista Obiettivo** | Occupare e mantenere una posizione per N turni consecutivi |

La partita finisce con una **vittoria** quando l'obiettivo è completato, o con una **sconfitta** se tutta la squadra viene eliminata.

---

### Abilità Speciali — Dettagli

- **Fuoco Soppressivo (Assalto):** l'assalto entra in modalità di fuoco soppressivo (costo 1 AP). Durante la fase nemica, qualsiasi VC che si trova o si sposta entro gittata 2 viene bloccato: AP azzerati, non può attaccare. La zona di soppressione è visibile sull'overlay con un cerchio arancione tratteggiato.
- **Overwatch (Cecchino):** entra in modalità sorveglianza (costo 1 AP). Se durante la fase nemica un VC entra nel raggio di gittata (6 tile) **e** nel cono visivo del cecchino, questi spara automaticamente con 2d6 + ATK. Il cecchino può effettuare **un solo attacco per turno nemico** — colpisce il primo nemico valido in ordine di attivazione. La **penalità gittata** si applica anche in overwatch. Nemici dietro muri, bunker o giungla fitta non vengono intercettati anche se a distanza.
- **Demolizione / Incendio (Geniere):** su un tile adiacente con bunker o ostacolo, demolisce (dado ≥4). Su un tile con vegetazione (giungla, villaggio, giardino), lo incendia immediatamente. Il fuoco blocca il passaggio per **2 turni** — sia per la squadra che per i VC — e si vede sulla mappa con l'animazione fiamme.
- **Primo Soccorso (Medico):** ripristina HP a un alleato adiacente.

---

### Fog of War (opzionale)

Il bottone **👁** nell'header attiva o disattiva la nebbia di guerra. Per impostazione predefinita è **attivata**.

Quando è **ON**:

- Le tile fuori dalla visibilità della squadra vengono oscurate
- I nemici non visibili non appaiono sulla mappa e non possono essere attaccati
- Il tooltip non rivela informazioni su tile nella nebbia

Ogni classe ha un proprio raggio di visione massimo:

| Classe | Visione |
|---|---|
| Assalto | 4 tile |
| Cecchino | 6 tile |
| Geniere | 4 tile |
| Medico | 3 tile |

Tieni la squadra unita per coprire più mappa; usa il cecchino come avanzato per esplorare da lontano.

---

### Line of Sight (LOS)

Il raggio di visione non dipende solo dalla distanza: il terreno può bloccare o ridurre il cono visivo. Il gioco tracccia un raggio tra l'unità e ogni tile, controllando gli ostacoli intermedi.

| Terreno intermedio | Effetto sul LOS |
|---|---|
| Giungla, Palude, Villaggio | −1 vision per ogni tile attraversato |
| Macerie, Palazzo/Tempio | −1 vision per ogni tile attraversato |
| Bunker, Ostacolo, Mura, Edificio | Blocca completamente il raggio |
| Radura, Sentiero, Fiume, Strada, Ponte | Nessun effetto |

Il tile bersaglio stesso è sempre visibile se il raggio arriva a raggiungerlo — i blocchi si applicano solo ai tile **intermedi**.

Esempi pratici:
- Un cecchino (visione 6) che guarda attraverso 3 tile di giungla ha vision residua 3 oltre la giungla.
- Un assalto (visione 4) non vede un nemico nascosto dietro un bunker, nemmeno se è adiacente.
- Demolire un muro trasforma un blocco totale in blocco parziale (macerie), aprendo sia un corridoio fisico che un varco visivo.

---

## Salvataggio automatico

Il gioco **salva automaticamente** la partita all'inizio di ogni turno giocatore, usando il localStorage del browser. Non è necessaria alcuna azione da parte del giocatore.

Quando si riapre il gioco con una partita in corso, nella schermata di selezione mappa compare un banner verde con le informazioni sull'ultima sessione (mappa, tipo missione, turno, data e ora). Premendo **▶ RIPRENDI** si rientra esattamente dallo stato in cui si era usciti.

Il salvataggio viene cancellato automaticamente al termine della partita (vittoria o sconfitta).

---

## Animazioni tile

Le mappe possono definire animazioni ambientali su tile specifici, configurabili via JSON senza toccare il codice. Le animazioni sono **sempre visibili**, anche attraverso il Fog of War — il fumo di un relitto o le fiamme di un edificio si vedono da lontano, e possono guidare la squadra verso l'obiettivo.

Tipi disponibili:

| Tipo | Descrizione |
|---|---|
| `smoke` | Fumo grigio che sale lentamente — ideale per relitti, incendi soppressi |
| `fire` | Fiamme arancio e rosse — per edifici in fiamme, esplosioni in corso |
| `fog` | Velo nebuloso pulsante — per zone umide, paludi, aree di copertura |

Per aggiungere animazioni a una mappa, inserire nel JSON della missione:

```json
"tileAnimations": [
  {"col": 5, "row": 3, "type": "smoke"},
  {"col": 2, "row": 7, "type": "fire"}
]
```

---

## Immagine mappa personalizzata

Ogni missione può avere una propria immagine di sfondo che sostituisce il rendering procedurale dei tile. Basta aggiungere il campo `"image"` nel JSON della missione:

```json
{
  "name": "Rung Sat",
  "image": "rung_sat_map.jpg",
  ...
}
```

- Il file immagine va messo nella cartella `missions/` (formati supportati: jpg, png, webp, svg)
- Quando l'immagine è presente, i colori e le texture dei tile non vengono disegnati — l'immagine li sostituisce completamente
- Rimane una griglia sottile sovrapposta per facilitare la navigazione
- Sprite unità, marcatori obiettivo, Fog of War ed effetti continuano a funzionare normalmente
- Se il file è assente o non caricabile, il gioco torna automaticamente al rendering procedurale

---

## Personalizzazione — config.json

Il file `config.json` nella cartella principale permette di personalizzare il gioco senza toccare il codice.

### Musica del menu

Per aggiungere musica di sottofondo al menu iniziale, inserire il percorso del file audio nel campo `menuMusic`:

```json
{
  "menuMusic": "assets/menu.ogg"
}
```

- Formati supportati: **ogg, mp3, wav**
- La musica parte in loop appena il menu viene mostrato
- Quando si preme "Inizia Missione", la musica fa un **fade-out di 800 ms** prima che la partita parta
- Lasciare la stringa vuota `""` o omettere il campo per nessuna musica al menu

### Immagini unità

Per sostituire gli sprite disegnati con immagini personalizzate, inserire il percorso del file per ogni classe:

```json
{
  "unitImages": {
    "assault":   "assets/assault.webp",
    "sniper":    "assets/sniper.webp",
    "engineer":  "assets/engineer.webp",
    "medic":     "assets/medic.webp",
    "grunt":     "assets/grunt.webp",
    "sniper_vc": "assets/sniper_vc.webp",
    "commander": "assets/commander.webp"
  }
}
```

- Formati supportati: **webp, png, jpg, svg**
- Lasciare la stringa vuota `""` per usare lo sprite canvas predefinito
- I percorsi sono relativi alla cartella principale del gioco
- È possibile sostituire solo alcune classi e lasciare le altre con lo sprite di default
- Se `config.json` è assente o non valido, il gioco funziona normalmente senza errori

### Suoni arma personalizzati

Ogni arma può avere un proprio suono di sparo, definito con il campo `sound` direttamente nell'oggetto arma in `config.json`:

```json
{
  "weapons": {
    "assault": [
      { "id": "rifle", "label": "M16", "atk": 3, "range": 2, "sound": "assets/m16.mp3" },
      { "id": "grenade", "label": "Granata", "atk": 5, "range": 3, "ammo": 2, "aoe": 1 }
    ],
    "grunt": [
      { "id": "ak47", "label": "AK-47", "atk": 2, "range": 2, "sound": "assets/ak47.mp3" }
    ]
  }
}
```

- Formati supportati: **ogg, mp3, wav**
- Il campo `sound` è opzionale: se assente o se il file non è caricabile, viene usato il suono sintetizzato di default
- File audio identici su più armi vengono precaricati una sola volta (cache per path)
- Il suono viene usato in tutti i contesti: attacco diretto, overwatch, fuoco soppressivo

### Armi e loadout

Ogni classe può avere un arsenale di armi definito in `config.json` sotto la chiave `weapons`. Se la sezione è assente, ogni unità usa i valori ATK/range di default dalla sua classe.

```json
{
  "weapons": {
    "assault": [
      { "id": "rifle",   "label": "M16",     "labelEn": "M16",     "atk": 3, "range": 2 },
      { "id": "grenade", "label": "Granata",  "labelEn": "Grenade", "atk": 5, "range": 3, "ammo": 2, "aoe": 1 }
    ],
    "sniper":    [{ "id": "rifle",  "label": "M14",   "labelEn": "M14",   "atk": 4, "range": 6 }],
    "engineer":  [{ "id": "rifle",  "label": "M16",   "labelEn": "M16",   "atk": 2, "range": 2 }],
    "medic":     [{ "id": "pistol", "label": "M1911", "labelEn": "M1911", "atk": 1, "range": 1 }],
    "grunt": [
      { "id": "ak47", "label": "AK-47", "labelEn": "AK-47", "atk": 2, "range": 2 },
      { "id": "rpg",  "label": "RPG-7", "labelEn": "RPG-7", "atk": 4, "range": 4, "ammo": 1, "aoe": 1, "maxCarriers": 1 }
    ],
    "sniper_vc": [{ "id": "rifle",  "label": "Mosin", "labelEn": "Mosin", "atk": 3, "range": 4 }],
    "commander": [{ "id": "pistol", "label": "TT-33", "labelEn": "TT-33", "atk": 3, "range": 2 }]
  }
}
```

**Campi per arma:**

| Campo | Tipo | Descrizione |
|---|---|---|
| `id` | string | Identificatore interno |
| `label` / `labelEn` | string | Nome visualizzato in italiano / inglese |
| `atk` | number | Valore ATK dell'arma (sovrascrive quello della classe) |
| `range` | number | Gittata massima in tile |
| `ammo` | number o null | Munizioni disponibili; `null` = illimitate |
| `aoe` | number | (opzionale) Raggio area d'effetto in distanza Manhattan |
| `maxCarriers` | number | (opzionale, solo VC) Max unità per missione che possono portare quest'arma |

**Comportamento:**

- Se un'unità ha **una sola arma** (o una sola usabile), attacca direttamente senza picker
- Se ha **più armi usabili**, appare un selettore nell'area azioni prima dell'attacco
- Le **armi AoE** (`aoe > 0`) mostrano prima un overlay arancione con il raggio di gittata, poi al click sul tile mostrano l'anteprima del raggio d'effetto con conferma/annulla; il combattimento avviene automaticamente senza dado manuale
- Le munizioni vengono scalate sull'oggetto unità e salvate con `saveGame()` — persistono tra turni e resume
- `maxCarriers` limita a livello di missione quante unità VC possono ricevere quell'arma (spawn iniziale + rinforzi + imboscata condividono il contatore in `G.missionState.vcCarrierCounts`)

**Loadout predefinito (config.json corrente):**

| Classe | Arma primaria | Arma secondaria |
|---|---|---|
| Assalto | M16 (ATK3, RNG2, ∞) | Granata (ATK5, RNG3, AoE1, ×2) |
| Cecchino | M14 (ATK4, RNG6, ∞) | — |
| Geniere | M16 (ATK2, RNG2, ∞) | — |
| Medico | M1911 (ATK1, RNG1, ∞) | — |
| Guerrigliero VC | AK-47 (ATK2, RNG2, ∞) | RPG-7 (ATK4, RNG4, AoE1, ×1, max 1 portatore) |
| Cecchino VC | Mosin (ATK3, RNG4, ∞) | — |
| Comandante VC | TT-33 (ATK3, RNG2, ∞) | — |

---

## Controlli

| Azione | Desktop | Mobile |
|---|---|---|
| Selezionare unità | Click sull'unità o sulla card nel pannello | Tap sulla card tab SQUADRA |
| Muovere | Click su "Muovi" oppure `M` | Tab AZIONI → Muovi → tap cella |
| Attaccare | Click su "Attacca" oppure `A` | Tab AZIONI → Attacca → tap nemico |
| Abilità speciale | Click su "Speciale" oppure `S` | Tab AZIONI → Speciale |
| Fine turno | Pulsante "Fine Turno" oppure `Invio` | Tab AZIONI → Fine Turno |
| Annulla azione | `Esc` | — |
| Panoramica mappa | Click + trascina | 1 dito + trascina |
| Zoom | Rotella del mouse | Pinch con 2 dita |
| Lanciare dado | Pulsante "LANCIA DADO" | Tab DADO |
| Torna al menu | Bottone **⌂** nell'header | Bottone **⌂** nell'header |

### Hotkeys desktop

Le scorciatoie da tastiera sono attive solo durante la **fase giocatore** e quando non è in corso un lancio di dado.

| Tasto | Azione |
|---|---|
| `M` | Modalità Muovi |
| `A` | Modalità Attacca |
| `S` | Modalità Speciale |
| `Invio` | Fine turno |
| `Esc` | Annulla la modalità corrente |

### Bottone ⌂ e back button

Il bottone **⌂** è visibile solo durante una partita attiva. Al click — e sul **tasto indietro del browser o del telefono Android** — viene richiesta conferma prima di abbandonare la missione; la musica fa un fade-out prima di tornare al menu.
