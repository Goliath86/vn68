# VIETNAM '68 — Vietnam Wargame

Un wargame tattico a turni ambientato nella Guerra del Vietnam, giocabile interamente nel browser senza installazioni.

---

## Il Gioco

Comandi una squadra di soldati americani in operazioni speciali nel Vietnam del 1968. Ogni missione si svolge su una mappa a griglia con terreni diversi, obiettivi specifici e forze nemiche Vietcong (VC) che reagiscono alle tue mosse.

Il gioco è pensato per una singola sessione: scegli la mappa, scegli il tipo di missione e portala a termine prima che la tua squadra venga eliminata.

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

La **copertura** aumenta la difesa dell'unità che occupa la cella, rendendo più difficile colpirla.

---

### Combattimento

Quando attacchi, il gioco ti chiede di **lanciare fisicamente il dado** premendo il pulsante dado. Il nemico invece lancia automaticamente.

**Formula di risoluzione:**

```
Tiro attacco  = 2d6 + valore ATK dell'attaccante
Tiro difesa   = DEF difensore + copertura terreno + 1d6
Danno         = max(0, tiro attacco − tiro difesa)
```

Il danno viene sottratto agli HP del difensore. Se gli HP scendono a 0, l'unità viene eliminata.

L'attacco è possibile solo entro la **gittata** dell'unità. Se il nemico è fuori gittata, l'attacco fallisce.

---

### Unità della Squadra

La squadra è composta da 4 soldati, uno per classe:

| Classe | HP | Movimento | ATK | DEF | Gittata | Abilità Speciale |
|---|---|---|---|---|---|---|
| **Assalto** | 10 | 4 | 3 | 1 | 2 | Fuoco Soppressivo (riduce AP nemico) |
| **Cecchino** | 7 | 3 | 4 | 0 | 6 | Overwatch (attacca nemici in movimento) — **1 sparo per turno** |
| **Geniere** | 9 | 3 | 2 | 1 | 2 | Demolizione (rimuove bunker e ostacoli) |
| **Medico** | 8 | 3 | 1 | 1 | 1 | Primo Soccorso (cura un alleato adiacente) |

---

### Nemici Vietcong

I VC si muovono e attaccano automaticamente durante la fase nemica. Esistono tre varianti:

| Tipo | Comportamento |
|---|---|
| Guerrigliero | Unità base, ATK 2, gittata 2 |
| Cecchino VC | Pericoloso a distanza, ATK 3, gittata 4 |
| Comandante VC | Più resistente e mobile, ATK 3, DEF 1 |

Dal turno configurato nella mappa possono arrivare **rinforzi VC**.

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

- **Fuoco Soppressivo (Assalto):** il bersaglio subisce una riduzione di 1 AP al turno successivo.
- **Overwatch (Cecchino):** entra in modalità sorveglianza; se un VC si muove nel suo raggio visivo, il cecchino spara automaticamente. Il cecchino può effettuare **un solo attacco per turno** — scegli con cura il bersaglio.
- **Demolizione (Geniere):** rimuove un bunker o un ostacolo adiacente, trasformandolo in terreno percorribile.
- **Primo Soccorso (Medico):** ripristina HP a un alleato adiacente.

---

### Fog of War (opzionale)

Il bottone **👁** nell'header attiva la nebbia di guerra. Per impostazione predefinita è disattivata.

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

## Personalizzazione — config.json

Il file `config.json` nella cartella principale permette di personalizzare il gioco senza toccare il codice.

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

---

## Controlli

| Azione | Desktop | Mobile |
|---|---|---|
| Selezionare unità | Click sull'unità o sulla card nel pannello | Tap sulla card tab SQUADRA |
| Muovere | Click su "Muovi", poi click sulla cella | Tab AZIONI → Muovi → tap cella |
| Attaccare | Click su "Attacca", poi click sul nemico | Tab AZIONI → Attacca → tap nemico |
| Panoramica mappa | Click + trascina | 1 dito + trascina |
| Zoom | Rotella del mouse | Pinch con 2 dita |
| Lanciare dado | Pulsante "LANCIA DADO" | Tab DADO |
