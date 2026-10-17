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

L'attacco è possibile solo entro la **gittata** dell'unità e se l'unità stessa ha il bersaglio in **linea di vista** (non basta che lo veda un compagno). Se il nemico è fuori gittata, l'attacco fallisce.

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

**Granate a mano:** il lancio non è preciso. Una volta su due la granata finisce su uno degli 8 tile attorno a quello scelto (quadrato 3×3 tratteggiato nell'anteprima): rami, lancio corto o lungo, rotolamenti. Non finisce mai fuori mappa né contro muri, edifici o bunker. Si vede la granata volare ad arco e rimbalzare fino al punto di caduta, poi esplode. Attenzione al fuoco amico: con il bersaglio a 2 tile la granata può finire accanto a chi l'ha lanciata.

**Munizioni:** le armi con munizioni limitate mostrano il numero rimanente (es. `×2`). Quando le munizioni si esauriscono, l'arma non appare più nel selettore.

---

### Composizione della Squadra

Prima di avviare la missione puoi scegliere la composizione della squadra. Nella schermata di briefing, sotto la lista dei tipi di missione, appaiono **4 slot** — uno per ogni soldato. Clicca su uno slot per cambiarne la classe: il click cicla tra Assalto, Cecchino, Geniere e Medico.

La composizione di default è una per classe, ma puoi portare due assalti e nessun medico, o due cecchini, a seconda della tattica che preferisci.

### Classi disponibili

| Classe | HP | Movimento | ATK | DEF | Gittata | Abilità Speciale |
|---|---|---|---|---|---|---|
| **Assalto** | 10 | 4 | 3 | 1 | 3 | Fuoco Soppressivo · **Granate ×2** (AoE, ATK5, gittata 3) |
| **Cecchino** | 7 | 3 | 4 | 0 | 6 | Overwatch (attacca nemici in movimento) — **1 sparo per turno**, caricatore da 1 colpo |
| **Geniere** | 9 | 3 | 2 | 1 | 3 | Demolizione (bunker/ostacoli, dado ≥4) · Incendio (vegetazione, immediato) · Disinnesco trappole · Sigilla tunnel |
| **Medico** | 8 | 3 | 1 | 1 | 1 | Cura (+3 HP a un alleato adiacente) — **ripristina il morale e ferma l'emorragia** |

> ATK e Gittata sono quelli dell'arma principale definita in `config.json` (M16, M14, M1911); se `config.json` non definisce armi per la classe si usano i valori base della classe.
> L'assalto ha il fucile M16 come arma primaria (caricatore da 3, 4 di riserva) più 2 granate, un fumogeno e il coltello. Il bottone **Attacca** usa l'arma principale (il fucile, o il coltello se il fucile è scarico); sotto di esso le **schede armi** dell'unità selezionata mostrano ogni arma con munizioni e statistiche: un click (o i tasti **1-9**) attacca con quell'arma. Sotto l'abilità speciale una riga di **icone** raccoglie le azioni secondarie (⟳ ruota, postura, 🩹 primo soccorso, ↶ annulla), visibili solo quando sono disponibili; su desktop l'angolo di ogni bottone mostra il tasto rapido. Su mobile a pannello chiuso la barra rapida mostra le azioni di ogni turno (Muovi, Attacca, Speciale, Ruota, Fine) e un bottone **⋯** che apre le altre (postura, ricarica, primo soccorso, annulla), visibili solo se disponibili; "Attacca" nella barra rapida apre ancora il selettore delle armi. Nel pannello dell'unità selezionata lo stato (abilità speciale, postura, occultamento, overwatch, munizioni, ferite, panico, emorragia, pilota) compare come **chip** colorate con un'etichetta breve; passando il mouse su una chip si legge la spiegazione completa.

---

### Morale e Panico

Quando un soldato US scende **sotto il 30% degli HP** a causa di un attacco nemico, entra in stato di **panico** (SCOSSO):

- **−1 AP per turno** (da 3 a 2)
- **Abilità speciale bloccata**
- Bordo rosso pulsante sull'unità sulla mappa
- Tag **SCO** rosso nella lista squadra

Il soldato rimane scosso finché il **medico** non lo cura riportandolo sopra la soglia del 30% HP — a quel punto il morale viene ripristinato e le penalità scompaiono.

> Tenere il medico operativo non è solo per sopravvivere: è l'unico modo per riportare in piena efficienza un soldato sotto shock.

### Ferite ed emorragia

| HP | Stato | ATK | Movimento |
|---|---|---|---|
| sopra il 60% | integro | — | normale |
| ≤ 60% | 🤕 **ferito** | −1 | +1 AP per ogni movimento |
| sotto il 30% | 🤕 **ferito gravemente** (e scosso) | −2 | +1 AP per ogni movimento (e −1 AP del panico) |

Il malus ATK vale per attacchi e overwatch (l'ATK non scende mai sotto 1); il sovraccosto di movimento si somma a quello della postura.

**Emorragia (🩸):** ogni colpo che ferisce un soldato può causare un'emorragia, con probabilità crescente col danno (1 danno 35%, 2 → 50%, 3 → 65%, 4+ → 80%); le punji la causano sempre. Un soldato che sanguina perde **1 HP all'inizio di ogni turno** e può morire dissanguato. Sulla pedina compare una goccia di sangue pulsante. A inizio turno l'emorragia ha **1 probabilità su 3 di fermarsi da sola** (in quel turno non toglie HP); per esserne sicuri serve il **medico**, che la ferma curando un compagno adiacente (non può fermare la propria).

**Primo soccorso (🩹, tasto H):** una sola volta per missione ogni soldato, medico compreso, può medicarsi da solo: **+2 HP** (anche fuori dal panico se supera il 30%), ma **non ferma l'emorragia** e consuma **tutti gli AP rimasti** (serve almeno 1 AP): per quel turno il soldato non può fare altro.

---

### Nemici Vietcong

I VC si muovono e attaccano automaticamente durante la fase nemica. Il loro spostamento è animato con una transizione fluida, rendendo il turno nemico leggibile a colpo d'occhio. Esistono tre varianti:

| Tipo | Comportamento |
|---|---|
| Guerrigliero | Unità base, ATK 2 (AK-47), gittata 2 — uno per missione porta anche RPG-7 (ATK 4, gittata 4, AoE, 1 colpo) |
| Cecchino VC | Pericoloso a distanza, ATK 3 (Mosin), gittata 4. Dopo ogni colpo salta un turno per ricaricare; una volta allertato non si avvicina oltre 3 caselle, resta al limite della gittata cercando copertura |
| Comandante VC | Più resistente e mobile, ATK 3 (TT-33), DEF 1 |

**Armi speciali VC:** un solo guerrigliero per missione può essere equipaggiato con un RPG-7 (1 colpo, mai sotto distanza 2). Lo usa quando l'esplosione colpirebbe più soldati, o quando rende più dell'AK-47 (per esempio se il bersaglio è fuori gittata dell'AK); evita di coinvolgere altri VC.

**Comportamento pattuglia:** finché non avvistano un soldato US (raggio 5), i VC pattugliano attivamente in base alla missione in corso:

| Missione | Pattuglia VC |
|---|---|
| **Search & Destroy** | Si spostano casualmente nelle vicinanze |
| **Recupero Pilota** | Convergono verso il pilota abbattuto; se già trovato, si dirigono al punto di estrazione per intercettare la squadra |
| **Ricognizione** | Esplorano l'intera mappa verso posizioni casuali |
| **Conquista Obiettivo** | Presidiano l'obiettivo più vicino |

**Propagazione dell'allerta:** quando un VC avvista la squadra, avvisa automaticamente tutti i compagni entro raggio 3. I VC allertati per propagazione si svegliano ma **non agiscono nel turno in cui vengono allertati** — il giocatore ha un turno per riposizionarsi o cercare copertura prima che la risposta nemica diventi piena. Solo il VC che ha avvistato direttamente la squadra attacca immediatamente.

**IA tattica:** una volta allertati, guerriglieri e comandanti valutano ogni tile raggiungibile nel turno:
- **Da dove e a chi sparare:** scelgono la combinazione di posizione, bersaglio e arma col miglior danno atteso e la maggiore probabilità di uccidere. In pratica **aggirano** per colpire sul fianco (copertura dimezzata) o alle spalle (niente copertura, +1 ATK), preferiscono i soldati allo scoperto o feriti e tengono conto della postura.
- **Dove stare:** a parità di tiro preferiscono tile coperti o nascosti, visti da pochi soldati, fuori dai coni di overwatch e dalle aree di fuoco soppressivo, e non ammassati con altri VC (granate). Dopo aver sparato, con AP rimasti, **ripiegano in copertura** se il guadagno è netto.
- **Avanzata e agguato:** se non possono sparare avanzano di copertura in copertura verso la squadra. Se sono già ben coperti e la squadra è vicina possono **restare in agguato** (il comandante lo fa sempre, i guerriglieri metà delle volte). Gli AP non spesi diventano un **agguato**: nel tuo turno il VC spara una volta al primo soldato che termina un movimento davanti o di lato a lui, in gittata, in vista e individuato. Un VC in agguato visibile ha un **mirino arancione** sulla pedina (e una nota nel tooltip): aggiralo, passa alle sue spalle o fuori dalla sua vista, oppure lascia che il primo movimento "consumi" l'agguato.
- **Aggiramento su più turni:** con almeno 3 guerriglieri allertati, una parte del gruppo prova ad aggirare la squadra. Sono circa un terzo: uno sulle mappe piccole, al massimo due sulle medie e tre sulle grandi. Ognuno sceglie un punto sul fianco o alle spalle di un soldato, rispetto a dove è rivolto, e ci arriva in più turni lungo il percorso meno visto dalla squadra. Mentre si sposta non spara, tranne che per un'occasione molto favorevole, e resta in agguato. Quando arriva, o appena può colpire il bersaglio dal fianco o alle spalle, torna a combattere normalmente. Rinuncia se il soldato cade, se viene colpito o dopo 6 turni. Se è in vista, il log lo segnala ("si sposta sul fianco"). Cecchini e comandanti non aggirano.

Tenersi al riparo non basta: il nemico cercherà le tue spalle e i tuoi fianchi.

**Guerriglia VC:**
- **Tunnel (🕳):** su ogni mappa ci sono alcuni ingressi nascosti (di default 3, nella vegetazione o tra le macerie, lontano dalla partenza). Un VC ferito (metà degli HP o meno) o in rotta che ne raggiunge uno **sparisce sotto terra**; al suo turno successivo **sbuca da un ingresso libero**, preferibilmente non in vista e a pochi tile dalla squadra, con +2 HP, il morale ritrovato e **in agguato**. Metà dei rinforzi può arrivare dai tunnel. Un soldato adiacente nota l'ingresso (il geniere da 2 tile), come chi vede un VC entrarci o uscirne. Il **geniere** può **sigillare** un ingresso individuato con la sua abilità (1 AP, rumore di un'esplosione); quando tutti gli ingressi sono sigillati, i VC rimasti dentro restano intrappolati.
- **Trappole piazzate:** un guerrigliero in pattuglia ogni tanto (15% per turno) nasconde una punji o una mina sul tile da cui parte, fino a 3 per missione. Se lo vedi mentre la piazza, la trappola è segnata sulla mappa.
- **Cecchini mimetizzati:** un cecchino VC tra la vegetazione o le macerie è **invisibile oltre 2 tile** finché non spara: lo sparo lo svela fino al turno VC successivo. Anche overwatch e fuoco soppressivo non lo vedono da lontano. Il cecchino VC cerca apposta queste posizioni.

Dal turno configurato nella mappa possono arrivare **rinforzi VC** periodici — sempre guerriglieri, sempre dallo stesso lato.

In aggiunta, ogni mappa ha un'**imboscata a sorpresa**: a un turno preciso (e una sola volta), un gruppo di VC emerge da una direzione inattesa — fianco o retro rispetto all'obiettivo — con unità di qualità superiore e già in stato di allerta. Il turno esatto non è comunicato al giocatore in anticipo.

---

### Tipi di Missione

Per ogni mappa puoi scegliere tra i tipi di missione disponibili:

| Missione | Obiettivo |
|---|---|
| **Ricognizione** | Raggiungere con almeno un soldato tutte le zone indicate |
| **Search & Destroy** | Eliminare il numero richiesto di VC (o tutti) |
| **Recupero Pilota** | Esplorare la mappa per localizzare il pilota abbattuto e scortarlo al punto di estrazione |
| **Conquista Obiettivo** | Occupare e mantenere una posizione per N turni consecutivi |

La partita finisce con una **vittoria** quando l'obiettivo è completato, o con una **sconfitta** se tutta la squadra viene eliminata.

#### Recupero Pilota — posizione nascosta

In questa modalità la posizione del pilota **non è nota all'inizio**. Il marker ✈ sulla mappa appare solo quando un'unità della squadra entra nel cono visivo del tile in cui si trova. Il punto di estrazione (EXTR) è invece sempre visibile.

Il pannello obiettivo riflette lo stato corrente:
- **Posizione sconosciuta** — il tile non è ancora stato avvistato
- **Da localizzare** — il tile è nel campo visivo, raggiungi il pilota
- **Trovato — porta all'LZ** — un soldato lo sta scortando
- **ESTRATTO** — missione completata

Se il soldato che scorta il pilota viene eliminato, il pilota **resta a terra** sul suo tile (il pannello torna a "Da localizzare"): un altro soldato può raggiungerlo e riprendere la scorta.

Se la Fog of War è **disattivata**, la posizione del pilota è visibile fin dall'inizio (comportamento identico al classico).

---

### Abilità Speciali — Dettagli

- **Fuoco Soppressivo (Assalto):** l'assalto entra in modalità di fuoco soppressivo (costo 1 AP). Durante la fase nemica, qualsiasi VC che si trova o si sposta entro la gittata dell'arma principale (3 tile con l'M16), **davanti o sui fianchi** dell'assalto e in linea di vista, viene bloccato: AP azzerati, non può attaccare. La zona di soppressione è visibile sull'overlay con un contorno arancione tratteggiato.
- **Overwatch (Cecchino):** entra in modalità sorveglianza (costo 1 AP). Se durante la fase nemica un VC entra nella gittata dell'arma principale (6 tile con l'M14) **e** nel cono frontale del cecchino (in linea di vista), questi spara automaticamente con 2d6 + ATK **+1** (mira già puntata). Il cecchino può effettuare **un solo attacco per turno nemico** — colpisce il primo nemico valido in ordine di attivazione. La **penalità gittata** si applica anche in overwatch. Nemici dietro muri, bunker o giungla fitta non vengono intercettati anche se a distanza.
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

### Meccaniche tattiche

- **Orientamento:** ogni unità, US e VC, guarda in una delle 4 direzioni (freccetta sul bordo della pedina). Rispetto a dove guarda, chi attacca si trova di **fronte** (cono di 90°), **alle spalle** (cono opposto) o **sul fianco** (il resto):
  - dal fianco la copertura del bersaglio è **dimezzata** (per difetto);
  - alle spalle la copertura è **nulla** e chi attacca ha **+1 ATK**.

  Vale per tutti gli attacchi diretti, overwatch e imboscate comprese, da entrambe le parti (non per granate, RPG e artiglieria). Muovendosi l'unità si gira nella direzione di marcia; chi spara si gira verso il bersaglio e il bersaglio, se sopravvive, si gira verso chi l'ha colpito. Una volta per turno ogni soldato può **ruotare gratis** (anche senza AP): bottone **⟳ Ruota**, poi click su uno dei 4 tile adiacenti. Annullare un movimento annulla anche la rotazione fatta dopo. I VC in pattuglia si accorgono della squadra a distanza piena davanti, a −1 sui fianchi e solo entro 2 tile alle spalle: avvicinarsi da dietro permette di sorprenderli. Tooltip, log e percentuale di colpire tengono conto del lato d'attacco.
- **Visione a cono:** ogni soldato vede a piena distanza davanti, **−1 sui fianchi** e al massimo **2 tile alle spalle** (mai più che sui fianchi); i tile adiacenti sono sempre visibili. Il malus notturno si applica prima del cono. Siccome si spara solo a ciò che si vede, **un bersaglio alle spalle oltre i 2 tile richiede prima una rotazione**. Con un'unità selezionata il contorno azzurro mostra la sua area visiva; in modalità rotazione, passando sulle frecce, si vede l'anteprima per quella direzione.
- **Overwatch e fuoco soppressivo direzionali:** l'overwatch del cecchino copre solo il **cono frontale** (fino alla gittata), ma spara con **+1 ATK**; il fuoco soppressivo dell'assalto copre **fronte e fianchi**, non le spalle, e solo in linea di vista. Le aree coperte sono tratteggiate sulla mappa: conviene ruotare il soldato dopo averli attivati.
- **Rumore:** ogni azione rumorosa della squadra allerta i VC entro un raggio (in tile, attraverso qualsiasi terreno), che si girano verso la fonte; il VC bersagliato si allerta sempre. Raggi: M1911 **2**, M16 **5**, M14 **7**, granata **6**, fumogeno **1**, artiglieria **8**, demolizione **6**, incendio **2**; armi dirette, overwatch e fuoco soppressivo dal tiratore, esplosioni dal punto d'impatto. In modalità attacco il contorno grigio puntinato mostra il raggio dell'arma scelta (🔊 nelle schede armi). Il log segnala solo i VC allertati in vista. Anche **gli spari dei VC allertano gli altri VC** entro il raggio della loro arma (AK-47 **5**, RPG-7 **7**, Mosin **6**, TT-33 **3**), che si girano verso il soldato bersagliato: uno scontro richiama i VC vicini. L'onda sonora (rossastra) si vede solo se il tiratore è visibile. Una missione può disattivarlo con `"vcNoise": false`.
- **Coltello (arma bianca):** tutti i soldati hanno un coltello (ATK 2, gittata 1, rumore **0**), si sceglie dalla sua scheda arma come le altre. Si usa sui tile adiacenti in orizzontale/verticale con il normale tiro (2d6 + ATK contro DEF + 1d6), ma **un colpo a segno uccide sempre**. Al posto della copertura del terreno conta la **guardia** del VC, che dipende da quanto vede chi lo assale: **di fronte +5 DEF**, **dal fianco +3**, **alle spalle nessuna** (e +1 ATK). Le **ferite** pesano il doppio (−2 ATK ferito, −4 grave). Contro un VC semplice, da sano: alle spalle ~98%, dal fianco ~74%, di fronte ~50%. Se il colpo fallisce c'è una **colluttazione**: se è mancato di poco (margine 0 o −1) il VC resta ferito (−1 HP) e metà delle volte anche il soldato (−1 HP); altrimenti il VC para e contrattacca (−1 HP, −2 se il colpo è fallito di 4 o più). Alle spalle permette di eliminare un VC senza allertare nessuno, oltre al VC colpito. Se il colpo **uccide** il nemico il soldato **avanza nel suo tile** gratis (0 AP, non annullabile; si ferma su un'eventuale trappola come un normale movimento): utile per strappare una posizione coperta. Il coltello non conta come sparo per il cecchino ed è utilizzabile anche dopo il colpo o durante la ricarica del fucile; non viene usato in overwatch né nel fuoco soppressivo.
- **Postura (🧍 in piedi / 🧎 accucciato / 🐍 sdraiato):** icona della postura nella riga delle azioni secondarie (tasto **C**). Il primo cambio del turno è gratuito, i successivi costano 1 AP; annullare un movimento annulla anche il cambio fatto dopo.

  | | In piedi | Accucciato | Sdraiato |
  |---|---|---|---|
  | ATK fuoco diretto (anche overwatch, non il coltello) | — | +1 | +1 |
  | DEF contro il fuoco diretto | — | +1 | +2 (solo +1 da distanza 1) |
  | DEF contro esplosioni | — | — | +1 |
  | Visione | — | −1 | −2 |
  | Distanza a cui i VC si accorgono di te | — | −1 | −2 |
  | Movimento | normale | +1 AP per movimento | striscia 1 solo tile, +1 AP |
  | Probabilità di essere notato se occultato | — | 50% | 30% |

  **Occultamento (🌿):** un soldato accucciato o sdraiato su un terreno che nasconde (vegetazione/macerie con LOS parziale, o copertura ≥2) è occultato. Un VC oltre distanza 1 lo nota solo se è entro la propria distanza d'allerta **e** supera il tiro di avvistamento (un tiro per VC per turno): altrimenti non si allerta e non gli spara, al massimo si avvicina alla squadra. A distanza 1 si viene sempre notati. Quando un VC ti individua, o quando spari / lanci con un'arma rumorosa, la posizione è **svelata** (👁) per tutti i VC fino alla fine del turno nemico; il coltello (rumore 0) non svela.
- **Munizioni e ricarica:** le armi da fuoco hanno un caricatore; ogni attacco consuma un colpo, e così ogni sparo d'overwatch e ogni raffica di fuoco soppressivo (che si attivano solo con un colpo in canna). Quando il caricatore è vuoto la scheda dell'arma diventa rossa e mostra **🔄 Ricarica**: un click (o il tasto **L**, 1 AP) riempie il caricatore usando uno dei caricatori di riserva; finiti quelli, resta il coltello. Nelle schede armi le munizioni sono indicate come `colpi/caricatore +riserva`. Su mobile a pannello chiuso la ricarica è nel menu **⋯** della barra rapida (segnalato da un pallino); se nessuna arma può più sparare, il bottone "Attacca" diventa direttamente "Ricarica".

  | Arma | Caricatore | Riserva | Note |
  |---|---|---|---|
  | M16 (Assalto) | 3 | 4 | |
  | M16 (Geniere) | 3 | 3 | |
  | M14 (Cecchino) | 1 | 10 | massimo 1 sparo per turno |
  | M1911 (Medico) | 2 | 3 | |

  Il **cecchino** spara un solo colpo per turno e deve ricaricare dopo ogni colpo: sparare + ricaricare occupa 2 AP, oppure si spara e si ricarica il turno dopo (anche prima di attivare l'overwatch, che richiede il colpo in canna). Il coltello resta sempre disponibile. Le granate, il fumogeno e la radio mantengono i loro usi limitati senza caricatore. I VC non hanno caricatori (il cecchino VC salta ancora un turno dopo ogni colpo).
- **Linea di tiro:** non si può sparare attraverso un compagno in piedi o accucciato che si trova sulla linea tra tiratore e bersaglio (si rischierebbe di colpirlo); un compagno **sdraiato** non blocca, si spara sopra di lui. Vale per attacchi diretti, overwatch e fuoco soppressivo, non per granate, RPG e artiglieria. Su desktop, in modalità attacco, un **raggio di mira** segue il mouse dall'unità selezionata: verde se la linea di tiro è libera, rosso se un compagno la blocca, arancione se il terreno o il fumo bloccano la vista, grigio se il punto è fuori dal campo visivo o dalla gittata; una ✕ segna cosa blocca e sotto il tile compare il motivo. Su mobile il raggio non c'è: restano evidenziati solo i bersagli attaccabili.
- **Trappole VC (punji e mine):** nascoste sulla mappa. Un soldato che ci passa sopra si ferma lì e subisce danno (punji 2 HP, mina 4 HP). Il **geniere** individua automaticamente le trappole a distanza 1; una trappola individuata è segnata sulla mappa, il movimento la aggira e il geniere può **disinnescarla** con l'abilità speciale (1 AP). I VC ne sono immuni.
- **Fumogeni:** l'Assalto ha un fumogeno (×1) che crea una cortina di raggio 1 per 2 turni. Il fumo blocca la linea di vista: chi è dentro vede ed è visto solo da distanza 1. Vale anche per i VC, che non possono sparare attraverso il fumo.
- **Linea di vista dei VC:** i VC seguono le stesse regole di vista dei soldati. La loro vista è la distanza d'allerta (5, di notte 3); ogni tile intermedio di vegetazione o macerie la riduce di 1, muri, bunker ed edifici la bloccano, il fumo pure. Un VC in pattuglia si allerta solo se vede un soldato; un VC in allerta spara solo a chi è in gittata **e** in vista, altrimenti avanza per prendere la linea di tiro (sa comunque dove sono i soldati non occultati). Vale anche per il cecchino VC, che cerca posizioni da cui vede il bersaglio, e per l'imboscata casuale. A distanza 1 la vista c'è sempre.
- **Supporto d'artiglieria:** il geniere porta la radio (una sola per squadra, 1 uso). Il colpo si richiede come un'arma ad area (gittata 10) ma **cade all'inizio del turno successivo**, dopo la mossa dei VC, su chiunque si trovi nell'area — soldati US compresi, e anche i VC nascosti nella nebbia. L'area d'impatto in arrivo è segnata in rosso sulla mappa.
- **Missioni notturne:** attivabili dal briefing (o imposte dalla mappa con `"night": true`). Il raggio visivo di ogni soldato cala di 1 (minimo 1) e i VC, che conoscono il terreno, si accorgono della squadra da 3 caselle invece di 5. Poiché per sparare serve la linea di vista, di notte anche il cecchino colpisce solo entro la propria visione ridotta.
- **Morale VC:** un VC sotto il 30% degli HP (una volta per unità) e tutti i VC entro 4 caselle da un comandante caduto vanno **in rotta** per 2 attivazioni: ripiegano lontano dalla squadra cercando copertura e non attaccano (bandiera bianca ⚐ sulla mappa).

---

## Salvataggio automatico

Il gioco **salva automaticamente** la partita all'inizio di ogni turno giocatore, usando il localStorage del browser. Non è necessaria alcuna azione da parte del giocatore.

Quando si riapre il gioco con una partita in corso, nella schermata di selezione mappa compare un banner verde con le informazioni sull'ultima sessione (mappa, tipo missione, turno, data e ora). Premendo **▶ RIPRENDI** si rientra esattamente dallo stato in cui si era usciti.

Il salvataggio viene cancellato automaticamente al termine della partita (vittoria o sconfitta).

---

## Mappa procedurale

I teatri **🎲 Zona Ignota** (giungla) e **🎲 Città Ignota** (urbano) non usano alcun file JSON: la mappa viene generata al momento, nella dimensione scelta nel briefing:

| Dimensione | Tile | VC iniziali (giungla / città) |
|---|---|---|
| Piccola | 16×12 | 6–8 / 7–9 |
| Media | 22×16 | 9–11 / 10–12 |
| Grande | 28×20 | 12–14 / 13–15 |

Sulle mappe più grandi crescono in proporzione anche trappole, ostacoli e bunker. Aumentano inoltre i rinforzi (3 VC invece di 2) e le imboscate, che scattano più tardi e portano più VC. In giungla c'è un terzo guado, in città un terzo ponte. Per la missione Cerca e distruggi servono più eliminazioni (+2 a dimensione). La dimensione scelta viene ricordata per le partite successive.

**Zona Ignota** — giungla del delta:

- uno di cinque **layout**, indicato nella descrizione del briefing:
  - **fiume da attraversare** perpendicolare all'avanzata;
  - **ansa**: il fiume piega ad angolo e chiude una sacca;
  - **fiume parallelo** all'avanzata, che divide la zona in due rive;
  - **confluenza**: due corsi d'acqua dividono la zona in settori;
  - **palude**: nessun fiume, ma una larga fascia di palude con qualche stagno;
- i fiumi si attraversano solo ai **guadi**: due o tre, tre o quattro con la confluenza. Sentieri collegano partenza, guadi e obiettivi;
- radure, paludi, un villaggio, bunker e ostacoli demolibili;
- partenza della squadra su un **bordo casuale** (nord, sud, est o ovest), obiettivi e VC verso il lato opposto, imboscate ai fianchi della partenza;
- verso villaggio, LZ e postazione radio ci sono sempre almeno **due percorsi distinti**: non si resta mai bloccati in un unico imbuto;
- obiettivi per tutti e 4 i tipi di missione (LZ, villaggio e bunker da ricognire, postazione radio da tenere; il pilota si è allontanato dalla LZ e aspetta a circa il 60% della strada dall'estrazione, segnalato dal fumo).

**Città Ignota** — distretto cittadino durante l'offensiva del Têt:

- una griglia di viali e strade. Ogni isolato ha un suo carattere: edifici fitti, parco, rovine, templi o baraccopoli. Un colpo d'artiglieria ha ridotto in macerie un gruppo di edifici;
- uno di cinque **layout**, indicato nella descrizione del briefing:
  - **fiume** con anse, attraversabile solo sui ponti (2–4);
  - **canale** rettilineo scavalcato da molti ponti;
  - **canale laterale** lungo l'avanzata, che isola una striscia di isolati raggiungibile dai ponti;
  - **fiume sul fianco**, che chiude un lato del quartiere senza bisogno di attraversarlo;
  - **nessun corso d'acqua**;
- dal lato opposto alla partenza, una **cittadella murata** addossata al bordo, in posizione variabile (anche d'angolo). Ha una porta principale a sud o su un fianco, un **secondo ingresso** su un altro lato e 1–3 **muri demolibili** (breccia del geniere). Dentro, pagode e giardini attorno al **Comando NVA**;
- partenza della squadra su un **bordo casuale**, VC in tutto il quartiere e dentro la cittadella, imboscate ai fianchi della partenza;
- verso comando, mercato e relitto ci sono sempre almeno **due percorsi distinti**;
- obiettivi per tutti e 4 i tipi di missione: pilota a circa il 60% della strada tra l'estrazione e il relitto (fuori dalle mura), segnalato dal fumo; ponte (o pagoda, se non ci sono ponti), mercato e comando da ricognire; comando da tenere.

Il generatore garantisce che ogni tile percorribile sia raggiungibile dalla partenza (la cittadella ha sempre una porta: il geniere non è obbligatorio). Il numero nel nome (**Settore 48213**, **Quartiere 48213**) è il seed: lo stesso seed produce sempre la stessa mappa. Nel briefing il bottone **🎲 Rigenera mappa** ne crea una nuova prima di iniziare.

La mappa generata viene salvata per intero insieme alla partita: con **▶ RIPRENDI** si ritrova identica (demolizioni comprese). Una nuova partita genera una mappa nuova.

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
      { "id": "rifle", "label": "M16", "atk": 3, "range": 3, "sound": "assets/m16.mp3" },
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

### Effetti sonori personalizzati

Anche i suoni di gioco (vittoria, morte, movimento, ecc.) possono essere sostituiti con file audio custom tramite la chiave `sounds` in `config.json`:

```json
{
  "sounds": {
    "move":       "assets/footstep.mp3",
    "hit":        "assets/hit.mp3",
    "death":      "assets/death.mp3",
    "miss":       "",
    "ambush":     "assets/ambush.mp3",
    "demolition": "assets/explosion.mp3",
    "disarm":     "",
    "melee":      "",
    "reload":     "",
    "heal":       "",
    "overwatch":  "",
    "spawn":      "",
    "turn_end":   "",
    "victory":    "assets/victory.mp3",
    "defeat":     "assets/defeat.mp3",
    "click":      ""
  }
}
```

- Lasciare il valore vuoto `""` per mantenere il suono sintetizzato
- `disarm` = disinnesco di una trappola da parte del geniere, `melee` = fendente del coltello, `reload` = ricarica
- I suoni di sparo (`shoot`, `shoot_vc`) **non vanno qui** — si definiscono nel campo `sound` di ogni arma
- Se il file non è caricabile, il gioco torna automaticamente al sintetizzato

### Effetti sonori specifici per missione

Ogni missione può sovrascrivere uno o più SFX di `config.json` aggiungendo la stessa chiave `sounds` direttamente nel JSON della missione:

```json
{
  "name": "Hue City",
  "sounds": {
    "move": "missions/hue_city_footstep.mp3"
  }
}
```

Questo permette, ad esempio, di avere passi su asfalto in città e passi su fogliame in giungla, mantenendo i suoni generici come fallback.

**Priorità di risoluzione per ogni SFX:**
1. Suono definito nel JSON della missione corrente
2. Suono definito in `config.json → sounds`
3. Suono sintetizzato via Web Audio API (default)

La cache dei suoni missione viene svuotata e ricaricata automaticamente ad ogni cambio missione (incluso il resume da salvataggio). Le stesse chiavi valide di `config.json → sounds` sono utilizzabili anche qui (esclusi `shoot`/`shoot_vc`, che si configurano per singola arma).

### Armi e loadout

Ogni classe può avere un arsenale di armi definito in `config.json` sotto la chiave `weapons`. Se la sezione è assente, ogni unità usa i valori ATK/range di default dalla sua classe.

```json
{
  "weapons": {
    "assault": [
      { "id": "rifle",   "label": "M16",     "labelEn": "M16",     "atk": 3, "range": 3 },
      { "id": "grenade", "label": "Granata",  "labelEn": "Grenade", "atk": 5, "range": 3, "ammo": 2, "aoe": 1 }
    ],
    "sniper":    [{ "id": "rifle",  "label": "M14",   "labelEn": "M14",   "atk": 4, "range": 6 }],
    "engineer":  [{ "id": "rifle",  "label": "M16",   "labelEn": "M16",   "atk": 2, "range": 3 }],
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
| `ammo` | number o null | Usi totali disponibili (granate, fumogeni, radio); `null` = illimitati |
| `mag` | number | (opzionale, solo US) Colpi per caricatore: ogni attacco (e ogni overwatch/raffica di soppressione) ne consuma 1; a caricatore vuoto serve ricaricare |
| `mags` | number | (opzionale, con `mag`) Caricatori di riserva; ogni ricarica ne consuma uno. Se assente sono illimitati |
| `reloadAp` | number | (opzionale, con `mag`) AP per ricaricare; default 1 |
| `shotsPerTurn` | number | (opzionale) Attacchi massimi per turno con quest'arma (il cecchino: 1) |
| `aoe` | number | (opzionale) Raggio area d'effetto in distanza Manhattan |
| `minRange` | number | (opzionale, solo armi AoE) Gittata minima in tile; default `aoe + 1`, così chi lancia non è mai nel raggio dell'esplosione |
| `maxCarriers` | number | (opzionale) Max unità per missione che possono portare quest'arma (contatori separati per squadra US e VC) |
| `rangePenalty` | boolean | (opzionale, solo US) Applica la penalità gittata (−1 ATK ogni 2 tile), anche in overwatch; se assente vale `true` solo per il cecchino |
| `noise` | number | (opzionale) Raggio del rumore in tile: i VC entro questa distanza si allertano. Armi US: dal tiratore per le armi dirette, dal punto d'impatto per le AoE. Armi VC: sempre dal tiratore. Default 4 (diretta) / 6 (AoE) |
| `melee` | boolean | (opzionale, solo US) Arma bianca: fendente al posto dei traccianti, esclusa da overwatch e soppressione; se uccide il bersaglio l'unità avanza nel suo tile (0 AP) |
| `rounds` | number | (opzionale, solo grafica) Traccianti mostrati per attacco (1–5); se assente 1 per i cecchini, 3 per le altre armi |
| `smoke` | number | (opzionale, solo armi AoE) Fumogeno: nessun danno, crea fumo nel raggio `aoe` per N turni |
| `artillery` | boolean | (opzionale, solo armi AoE) Richiesta d'artiglieria: il colpo cade all'inizio del turno successivo e colpisce anche i VC nascosti |
| `thrown` | boolean | (opzionale, solo armi AoE US) Lancio a mano: animazione ad arco con rimbalzi prima dell'esplosione |
| `scatter` | number | (opzionale, solo armi AoE US) Deviazione del lancio: raggio in tile del quadrato in cui l'arma può cadere al posto del tile scelto (1 = 3×3); mai fuori mappa né su tile con `losBlock: "full"` |
| `scatterChance` | number | (opzionale, con `scatter`) Probabilità (0–1) che il lancio devii su un altro tile del quadrato; default 0.5 |

**Comportamento:**

- Se un'unità ha **una sola arma** (o una sola usabile), attacca direttamente senza picker
- Se ha **più armi usabili**, appare un selettore nell'area azioni prima dell'attacco
- Le **armi AoE** (`aoe > 0`) mostrano prima un overlay arancione con le tile bersagliabili (tra gittata minima e massima: non si può lanciare troppo vicino a sé), poi al click sul tile mostrano l'anteprima del raggio d'effetto con conferma/annulla; il combattimento avviene automaticamente senza dado manuale
- Le munizioni vengono scalate sull'oggetto unità e salvate con `saveGame()` — persistono tra turni e resume
- `maxCarriers` limita a livello di missione quante unità VC possono ricevere quell'arma (spawn iniziale + rinforzi + imboscata condividono il contatore in `G.missionState.vcCarrierCounts`)

**Loadout predefinito (config.json corrente):**

| Classe | Arma primaria | Arma secondaria |
|---|---|---|
| Assalto | M16 (ATK3, RNG3, ∞) | Granata (ATK5, RNG3, AoE1, ×2) · Fumogeno (RNG3, AoE1, ×1, 2 turni) |
| Cecchino | M14 (ATK4, RNG6, ∞) | — |
| Geniere | M16 (ATK2, RNG3, ∞) | Radio: artiglieria (ATK6, RNG10, AoE1, ×1, max 1 per squadra) |
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
| Fine turno | Pulsante "Fine Turno" oppure `Invio` (conferma se qualche unità ha ancora AP) | Tab AZIONI → Fine Turno |
| Annulla azione | `Esc` | — |
| Annulla ultimo movimento | Pulsante "↶ Annulla movimento" oppure `U` / `Ctrl+Z` | Tab AZIONI → Annulla movimento |
| Unità successiva con AP | `Tab` (`Shift+Tab` per la precedente) | — |
| Panoramica mappa | Click + trascina | 1 dito + trascina |
| Zoom | Rotella del mouse | Pinch con 2 dita |
| Lanciare dado | Pulsante "LANCIA DADO" | Tab DADO |
| Torna al menu | Bottone **⌂** nell'header | Bottone **⌂** nell'header |

### Addestramento (tutorial)

Nella scelta della mappa, la scheda **🎓 Addestramento** apre l'elenco delle lezioni guidate. Ognuna è una piccola missione con squadra e nemici prestabiliti e un **istruttore** che, in alto sulla mappa, spiega passo passo cosa fare. Indica il tile su cui andare con una freccia gialla e fa lampeggiare il bottone da usare. Si avanza compiendo l'azione richiesta (o con **Avanti ▸** sui passi solo descrittivi); il pannello si può ridurre con **▾**.

| # | Lezione | Classi | Argomenti |
|---|---|---|---|
| 1 | Primi passi | Assalto | selezione, AP e costo del terreno, annulla, orientamento e rotazione, attacco e dadi, turni |
| 2 | Ombre nella giungla | Assalto | postura, coni di vista dei VC, attacchi alle spalle, coltello silenzioso, rumore, occultamento |
| 3 | Occhio di falco | Cecchino | gittata e penalità, un colpo per turno, ricarica, overwatch |
| 4 | Genio militare | Geniere | trappole, disinnesco, artiglieria via radio, demolizione, tunnel VC |
| 5 | Sangue e bende | Medico, Assalto, Cecchino | ferite, emorragia, panico, cure, primo soccorso; recupero pilota |
| 6 | Operazione congiunta | squadra completa | schede armi, linea di tiro, tattiche VC, fuoco soppressivo, granate |

Le lezioni superate sono segnate con ✓ (salvato nel browser) e a fine lezione il bottone **▶ Lezione successiva** porta alla seguente. Le lezioni non entrano nello storico delle statistiche.

**Creare una lezione:** è una normale mappa JSON in `missions/tutorial/`, elencata in `missions/tutorial/index.json` (che contiene anche i tipi di tile condivisi). Rispetto a una missione ha:
- **`squad` ed `enemies`:** squadra e VC fissi; `"hold": true` indica una sentinella che resta ferma finché non viene allertata.
- **Blocco `tutorial`:** `missionType` e i passi, `{ "id", "until", "highlight", "ui", "fresh" }`.
- **`until`:** è `"next"` (bottone Avanti) oppure un evento, con campi da confrontare ed eventualmente `at` / `within` sulla posizione. Gli eventi sono `select`, `move`, `rotate`, `stance`, `attack`, `aoe`, `reload`, `firstaid`, `special` (con `kind`: `overwatch`, `suppression`, `heal`, `disarm`, `demolish`, `burn`, `seal`), `trapFound`, `tunnelFound`, `endTurn`, `turnStart`.
- **Testi dei passi:** stanno in `translations.<lingua>.tutorial.<id>`.

### Statistiche di fine missione

A fine missione (vittoria o sconfitta), sotto l'esito, compare un **riepilogo statistico**:
- **Missione:** turni, sopravvissuti, VC eliminati, HP rimasti.
- **Fuoco della squadra e dei VC:** colpi a segno con la precisione **reale** confrontata con quella **attesa** (la stessa formula dei dadi: se la reale è molto sotto, è stata sfortuna), danni, attacchi dal fianco e alle spalle, overwatch, soppressioni, esplosivi, uccisioni col coltello, fuoco amico, spari dall'agguato dei VC, RPG.
- **Munizioni:** colpi sparati, ricariche, caricatori di riserva e granate rimasti.
- **Ferite e cure:** emorragie, HP persi e morti per dissanguamento, primo soccorso, cure del medico, trappole.
- **Furtività:** VC allertati dal rumore (della squadra e degli spari VC), volte in cui un VC ti ha avvistato o non si è accorto di te.
- **Ultime missioni:** medie sulle ultime missioni giocate (fino a 50, salvate nel browser): vittorie, turni, caduti, precisione.

Il bottone **📋 Copia statistiche** copia tutto come testo, con anche i dati grezzi: utile per confrontare le partite e ritoccare i numeri del bilanciamento.

### Hotkeys desktop

Le scorciatoie da tastiera sono attive solo durante la **fase giocatore** e quando non è in corso un lancio di dado.

| Tasto | Azione |
|---|---|
| `M` | Modalità Muovi |
| `A` | Modalità Attacca (arma principale) |
| `1`–`9` | Attacca con l'arma della scheda corrispondente (o la ricarica, se scarica) |
| `S` | Modalità Speciale |
| `R` | Rotazione (gratis, una volta per turno) |
| `C` | Postura |
| `L` | Ricarica |
| `H` | Primo soccorso (una volta per missione) |
| `Invio` | Fine turno (nel dialogo di conferma: conferma) |
| `Esc` | Annulla la modalità corrente (nel dialogo di conferma: annulla) |
| `U` / `Ctrl+Z` | Annulla l'ultimo movimento |
| `Tab` / `Shift+Tab` | Seleziona l'unità successiva / precedente con AP |

**Annulla movimento:** si può annullare solo l'ultimo movimento, e solo se non ha rivelato nuovi nemici né cambiato lo stato della missione (pilota raccolto, zona ricognita). Qualsiasi altra azione (attacco, abilità speciale, ricarica, primo soccorso, fine turno) lo rende definitivo; rotazione e cambio postura fatti dopo il movimento vengono annullati insieme a lui.

**Probabilità di colpire:** in modalità attacco, sopra ogni bersaglio compare la percentuale di colpire (stessa formula del combattimento: 2d6+ATK contro DEF+copertura+1d6, penalità gittata, postura e ferite incluse). La percentuale è colorata: verde dal 75%, gialla dal 50%, rossa sotto. Su desktop il tooltip del bersaglio mostra anche il danno medio, la probabilità di uccidere e, su una seconda riga, la scomposizione di ATK e DEF (arma, distanza, ferita, postura, spalle, copertura o guardia). Su mobile il **primo tap** su un nemico lo punta e mostra la stessa scomposizione nel pannello, il **secondo tap** (o il bottone 🎯 Fuoco) spara. Per granate e RPG, prima della conferma, ogni bersaglio nel raggio mostra la propria percentuale; i soldati della squadra sono bordati di rosso e il pannello avvisa del fuoco amico.

### Bottone ⌂ e back button

Il bottone **⌂** è visibile solo durante una partita attiva. Al click — e sul **tasto indietro del browser o del telefono Android** — viene richiesta conferma prima di abbandonare la missione; la musica fa un fade-out prima di tornare al menu.

---

## Creare una nuova missione

Aggiungere una mappa richiede solo due file. Zero modifiche al codice JS.

### 1. Registrare la mappa in `missions/catalog.json`

```json
{
  "file": "mia_mappa.json",
  "icon": "🗺️",
  "color": "#334455",
  "theaterColor": "#334455",
  "labels": {
    "it": { "label": "Nome Mappa", "subtitle": "Luogo · Anno", "theater": "TEATRO" },
    "en": { "label": "Map Name",   "subtitle": "Place · Year",  "theater": "THEATER" }
  }
}
```

Per una mappa procedurale si usa `"generator": "jungle"` (o `"urban"`) al posto di `"file"` (nessun JSON da creare; i generatori disponibili sono in `js/mapGen.js`, `MAP_GENERATORS`).

### 2. Creare `missions/mia_mappa.json`

Struttura completa con tutti i campi:

```json
{
  "name": "Nome interno",
  "description": "Descrizione breve",
  "cols": 15,
  "rows": 12,
  "image": "mia_mappa.jpg",
  "ambient": "missions/mia_mappa_ambient.ogg",
  "sounds": {
    "move": "missions/mia_mappa_footstep.mp3"
  },

  "tileTypes": {
    "C": { "id": "clearing", "label": "Radura",  "moveCost": 1, "coverBonus": 0, "color": "#8aaa55" },
    "J": { "id": "jungle",   "label": "Giungla", "moveCost": 2, "coverBonus": 2, "color": "#2d5a1b",
           "losBlock": "partial", "burnable": true },
    "R": { "id": "river",    "label": "Fiume",   "moveCost": 1, "coverBonus": 0, "color": "#336699",
           "impassable": true },
    "B": { "id": "bunker",   "label": "Bunker",  "moveCost": 1, "coverBonus": 3, "color": "#5a5040",
           "losBlock": "full", "demolishable": true, "demolishResult": "J" },
    "O": { "id": "objective","label": "Obiettivo","moveCost": 1, "coverBonus": 0, "color": "#cc9900" }
  },

  "grid": [
    ["J","J","C","C","C","J","J","C","C","C","J","J","C","C","C"],
    ["C","C","C","J","C","C","C","J","C","C","C","J","C","C","C"]
  ],

  "playerStart": [
    {"col": 0, "row": 6},
    {"col": 1, "row": 6},
    {"col": 0, "row": 7},
    {"col": 1, "row": 7}
  ],

  "vcSpawnZones":  [{"colMin": 10, "colMax": 14, "rowMin": 0, "rowMax": 11}],
  "vcCount": 6,

  "reinforcementTurn": 5,
  "reinforcementCount": 2,

  "vcAmbushTurn": 4,
  "vcAmbushCount": 2,
  "vcAmbushZones": [{"colMin": 0, "colMax": 3, "rowMin": 0, "rowMax": 3}],

  "trapCount": 3,
  "trapZones": [{"colMin": 4, "colMax": 12, "rowMin": 0, "rowMax": 11}],
  "traps": [{"col": 6, "row": 5, "type": "mine"}],
  "night": false,
  "nightVisionPenalty": 1,
  "vcNightPenalty": 2,

  "supportedMissions": ["recon", "search_destroy", "rescue_pilot", "capture_objective"],

  "objectives": {
    "recon": [
      {"col": 7, "row": 3, "label": "Zona A"},
      {"col": 12, "row": 9, "label": "Zona B"}
    ],
    "search_destroy": {"eliminateAll": false, "minKills": 4},
    "rescue_pilot": {
      "pilotCol": 11, "pilotRow": 3,
      "extractCol": 0, "extractRow": 11,
      "tileAnimations": [{"col": 11, "row": 3, "type": "smoke"}]
    },
    "capture_objective": [
      {"col": 10, "row": 5, "label": "Posizione Alpha", "holdTurns": 3}
    ]
  },

  "tileAnimations": [
    {"col": 5, "row": 3, "type": "fog"}
  ],

  "translations": {
    "it": {
      "name": "Nome IT",
      "description": "Descrizione IT",
      "tileLabels": {
        "clearing": "Radura", "jungle": "Giungla", "river": "Fiume",
        "bunker": "Bunker VC", "objective": "Obiettivo"
      },
      "objectives": {
        "recon": [{"label": "Zona A"}, {"label": "Zona B"}],
        "capture_objective": [{"label": "Posizione Alpha"}]
      }
    },
    "en": {
      "name": "Map Name EN",
      "description": "Description EN",
      "tileLabels": {
        "clearing": "Clearing", "jungle": "Jungle", "river": "River",
        "bunker": "VC Bunker", "objective": "Objective"
      },
      "objectives": {
        "recon": [{"label": "Zone A"}, {"label": "Zone B"}],
        "capture_objective": [{"label": "Alpha Position"}]
      }
    }
  }
}
```

### Campi opzionali: trappole e notte

| Campo | Tipo | Descrizione |
|---|---|---|
| `trapCount` | number | Trappole casuali (punji o mina) piazzate a inizio missione; default 0 |
| `trapZones` | array | Zone `{colMin, colMax, rowMin, rowMax}` per le trappole casuali; se assenti, ovunque ad almeno 4 caselle dalla partenza |
| `traps` | array | Trappole fisse `{col, row, type, dmg?}`; `type` = `"punji"` (2 HP) o `"mine"` (4 HP) |
| `night` | boolean | Missione sempre notturna (l'opzione nel briefing viene bloccata) |
| `vcNoise` | boolean | (opzionale) `false` = gli spari dei VC non allertano gli altri VC; default attivo |
| `tunnels` | array | (opzionale) Ingressi di tunnel VC in posizione fissa: `[{ "col", "row" }]`; se presente sostituisce quelli casuali |
| `tunnelCount` | number | (opzionale) Numero di ingressi casuali (su tile che nascondono, lontano dalla partenza); default 3, `0` = nessun tunnel |
| `vcTrapPlantMax` | number | (opzionale) Trappole che i VC in pattuglia possono piazzare durante la missione; default 3, `0` = nessuna |
| `squad` | array | (opzionale) Squadra fissa al posto della scelta nel briefing: `[{ "cls", "col", "row", "facing"?, "hp"?, "bleeding"?, "stance"? }]` |
| `enemies` | array | (opzionale) VC in posizione fissa al posto dello spawn casuale: `[{ "cls", "col", "row", "facing"?, "alerted"?, "hold"?, "hp"? }]`; `hold` = sentinella che non pattuglia finché non è allertata |
| `grid` | array | Ogni riga può essere anche una stringa (`"JJCCT..."`) invece di un array di caratteri |
| `nightVisionPenalty` | number | Riduzione del raggio visivo dei soldati di notte; default 1 |
| `bleedStopChance` | number | Probabilità (0–1) che un'emorragia si fermi da sola a inizio turno; default 1/3, `0` = solo il medico la ferma |
| `vcNightPenalty` | number | Riduzione di notte della distanza d'allerta e della vista dei VC (base 5, minimo 2); default 2 |
| `rain` | boolean / object | (opzionale, solo visivo) `true` = piove per tutta la missione; `{ "chance", "minTurns", "maxTurns", "fromStart" }` = acquazzoni casuali: a inizio di ogni turno giocatore, se non piove, comincia con probabilità `chance` (default 0.2) e dura da `minTurns` a `maxTurns` turni (default 2–4); `fromStart: true` = il primo acquazzone è già in corso a inizio missione |
| `mist` | boolean / object | (opzionale, solo visivo) Banchi di nebbiolina che derivano lenti: `true` = sui tile palude (`id` `"swamp"`); `{ "tiles": ["swamp", "river"], "density": 1 }` per scegliere gli id dei tile e lo spessore (0.5 = rada, 2 = fitta) |
| `temperature` | object | (opzionale, solo informativo) Intervallo di temperatura in °C mostrato nel pannello meteo: `{ "day": [min, max], "night": [min, max] }`; default giorno 27–34, notte 21–26 (pianura del Sud). La pioggia la abbassa di 3°, il cielo coperto di 1° |
| `cloudy` | number | (opzionale, solo informativo) Probabilità (0–1) di cielo coperto a inizio missione; default 0.35. A ogni turno il cielo cambia con probabilità 20% |

### Campi del tile type

| Campo | Tipo | Descrizione |
|---|---|---|
| `id` | string | Identificatore interno (usato in `tileLabels`) |
| `label` | string | Nome di default (usato se traduzione assente) |
| `moveCost` | number | AP per attraversare il tile (0 = gratis, 3 = palude) |
| `coverBonus` | number | Bonus difesa per chi occupa il tile |
| `color` | string | Colore hex per il rendering procedurale |
| `impassable` | bool | Se `true`, blocca il movimento (muri, fiumi) |
| `losBlock` | string | `"full"` = blocca la visione, `"partial"` = −1 al raggio per ogni tile attraversato |
| `burnable` | bool | Il geniere può incendiarlo (fuoco per 2 turni) |
| `demolishable` | bool | Il geniere può demolirlo con dado ≥ 4 |
| `demolishResult` | string | Chiave del tile che sostituisce quello demolito |

### Tipi di obiettivo

| Tipo | Struttura in `objectives` |
|---|---|
| `recon` | Array di `{"col", "row", "label"}` — zone da raggiungere |
| `search_destroy` | `{"eliminateAll": bool, "minKills": N}` |
| `rescue_pilot` | `{"pilotCol", "pilotRow", "extractCol", "extractRow"}` — la posizione del pilota è nascosta nella FOW |
| `capture_objective` | Array di `{"col", "row", "label", "holdTurns"}` — occupare per N turni consecutivi |

Puoi includere solo i tipi che vuoi supportare e dichiararli in `supportedMissions`.

### File opzionali

| File | Descrizione |
|---|---|
| `missions/mia_mappa.jpg` | Immagine di sfondo (sostituisce i tile colorati); dichiarata con `"image": "mia_mappa.jpg"` |
| `missions/mia_mappa_ambient.ogg` | Musica ambientale in loop durante la partita |
| `"sounds": { "move": "..." }` | SFX specifici per questa mappa (sovrascrivono `config.json`) |

### Animazioni tile

Aggiungi animazioni ambientali senza toccare il codice:

```json
"tileAnimations": [
  {"col": 5, "row": 3, "type": "smoke"},
  {"col": 2, "row": 7, "type": "fire"},
  {"col": 9, "row": 1, "type": "fog"}
]
```

Le animazioni globali (`tileAnimations` alla radice) sono sempre visibili. Quelle dentro `objectives.<tipo>.tileAnimations` appaiono solo nella modalità corrispondente. Il fumo è visibile anche attraverso la Fog of War — utile come indicatore visivo per la posizione del pilota in `rescue_pilot`.
