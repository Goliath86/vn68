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

Dal turno configurato nella mappa possono arrivare **rinforzi VC** periodici — di default guerriglieri (la mappa può cambiarli con `reinforcementMix`), sempre dallo stesso lato.

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
- **Supporto d'artiglieria:** il geniere porta la radio (una sola per squadra, 1 uso). Il colpo si richiede come un'arma ad area (gittata 10) ma **cade all'inizio del turno successivo**, dopo la mossa dei VC, su chiunque si trovi nell'area — soldati US compresi, e anche i VC nascosti nella nebbia. Non è un colpo di precisione: arriva una **salva di 5–6 colpi** cadenzati, ognuno su un tile a caso del quadrato 5×5 attorno al punto richiesto (più probabile verso il centro), ciascuno con la sua esplosione (raggio 1, cratere, alberi scossi). Il tile colpito in pieno viene distrutto: giungla, villaggi e giardini diventano **terra bruciata** e bruciano per 2 turni, muri, edifici, templi e bunker crollano in **macerie**, gli ostacoli vengono spazzati via. L'area della salva in arrivo è segnata in rosso sulla mappa (più scura dove cadono i colpi); l'anteprima mostra per ogni bersaglio la probabilità di essere colpito da almeno un colpo.
- **Attacco aereo al napalm:** il geniere ha anche una seconda radio (una sola per squadra, 1 uso). Si sceglie una **linea** di tile: primo click sul tile d'inizio (gittata 3–12), secondo click sul tile finale, in orizzontale, verticale o diagonale, al massimo 5 tile. Dopo la conferma, all'inizio del turno successivo l'ombra di un aereo attraversa tutta la mappa nella direzione scelta, da un bordo all'altro, e sgancia sui tile della linea uno dopo l'altro: fiammata e fumo nero, poi il tile resta **in fiamme per 2 turni** (giungla, villaggi e giardini diventano terra bruciata; acqua e muri non bruciano). Chi si trova sulla linea, soldati US e VC nascosti compresi, subisce un attacco ATK4 **senza copertura del terreno**. La linea in arrivo resta segnata sulla mappa con la freccia della direzione di volo.
- **Missioni notturne:** attivabili dal briefing (o imposte dalla mappa con `"night": true`). Il raggio visivo di ogni soldato cala di 1 (minimo 1) e i VC, che conoscono il terreno, si accorgono della squadra da 3 caselle invece di 5. Poiché per sparare serve la linea di vista, di notte anche il cecchino colpisce solo entro la propria visione ridotta.
- **Morale VC:** un VC sotto il 30% degli HP (una volta per unità) e tutti i VC entro 4 caselle da un comandante caduto vanno **in rotta** per 2 attivazioni: ripiegano lontano dalla squadra cercando copertura e non attaccano (bandiera bianca ⚐ sulla mappa).

---

## Campagna

La scheda **🎖 Campagna** del menu porta a una serie di operazioni giocate da un **plotone di 8 soldati con nome**, di cui se ne schierano 4 alla volta. Quello che succede in missione resta:

| Esito del soldato a fine missione | Conseguenza |
|---|---|
| Illeso (HP sopra il 60%) | pronto per la prossima operazione |
| Ferito (HP ≤ 60%) | fuori 1 operazione |
| Ferito grave (HP < 30% o emorragia in corso) | fuori 2 operazioni |
| Caduto | morto per sempre (muro dei caduti); in una missione **vinta** ha 1 probabilità su 3 di essere invece evacuato in elicottero, fuori 3 operazioni |

Chi resta al comando recupera un'operazione di convalescenza ogni volta che il plotone ne gioca una.

**Comando (HQ).** Tra una missione e l'altra si vedono il briefing, il plotone e le requisizioni. Si scelgono i soldati da schierare (tutti quelli pronti, fino a 4) e, se l'operazione ne offre più d'una, la missione. Se nessuno è pronto, **Riposo** fa passare un'operazione ai feriti.

**Esperienza e gradi.** A fine missione ogni soldato guadagna XP: +1 se sopravvive, +1 per ogni VC ucciso (anche con esplosivi, overwatch, artiglieria, napalm o sigillando i tunnel), +1 se la missione è vinta, +1 al medico per ogni cura.

| Grado | XP | Bonus |
|---|---|---|
| Soldato (Pvt.) | 0 | — |
| Soldato scelto (PFC) | 3 | +1 HP |
| Caporale (Cpl.) | 7 | scelta di un perk tra 2 |
| Sergente (Sgt.) | 12 | secondo perk, +1 HP |

Perk: **Mano ferma** (+1 ATK in overwatch, cecchino), **Pellaccia** (+2 HP), **Silenzioso** (spari −1 di rumore), **Esploratore** (individua trappole e tunnel come il geniere), **Medico da campo** (cura 1 HP in più). I perk sono dati di `config.json` (`perks`): si possono cambiare o aggiungere.

**Punti requisizione (PR).** Si parte con 2. Una missione vinta ne dà 3 (o la ricompensa indicata dalla missione), +1 se nessuno è ferito o caduto; ogni caduto costa 1. All'HQ si spendono in:

| Spesa | Costo | Effetto |
|---|---|---|
| Rimpiazzo | 2 PR | nuovo soldato semplice della classe scelta (massimo 8 nel plotone) |
| Cura accelerata | 1 PR | un ferito torna subito disponibile |
| Munizioni extra | 1 PR | per la prossima operazione: +1 caricatore di riserva e +1 granata/fumogeno a testa |
| Salva d'artiglieria | 2 PR | +1 uso della radio (serve il geniere che la porta) |
| Attacco al napalm | 3 PR | +1 attacco al napalm (serve il geniere) |

Le dotazioni si possono restituire finché l'operazione non parte.

**Sconfitta e ritirata.** Una missione fallita si può ritentare, ma i caduti restano caduti. Abbandonare la missione con ⌂ è una **ritirata**: conta come missione fallita, i soldati tornano come erano all'ultimo salvataggio, senza XP né PR. La campagna è vinta dopo l'ultima operazione ed è persa quando, contando i feriti e i rimpiazzi che si possono pagare, non si arriva a 4 soldati.

**Operazioni a scelta e pressione VC.** Nella **Campagna dinamica** (generata dal seed, su mappe procedurali) ogni operazione offre tre missioni: **facile** (−2 VC, 2 PR), **normale** (3 PR), **difficile** (+2 VC, 5 PR). Vincere una facile alza la **pressione VC** di 1 (fino a 4), una difficile la abbassa: ogni punto di pressione aggiunge un VC alle missioni successive. I VC crescono comunque operazione dopo operazione.

La campagna in corso resta nel browser (`localStorage`); la missione in corso ha un salvataggio suo, separato da quello delle partite libere, e compare in un secondo banner **riprendi** nel menu.

### Creare una campagna

Una campagna è un JSON in `missions/campaigns/`, elencato in `missions/campaigns/index.json` (`{ "campaigns": ["delta68.json", "dynamic.json"] }`):

```json
{
  "startRoster": ["assault", "assault", "sniper", "sniper", "engineer", "engineer", "medic", "medic"],
  "difficulty": { "reinforcementTurn": [6, 4] },
  "operations": [
    { "id": "op1", "map": "rung_sat.json", "missionType": "recon" },
    { "id": "op2", "choices": [
      { "id": "op2_pilot", "generator": "jungle", "size": "small", "missionType": "rescue_pilot" },
      { "id": "op2_raid", "map": "rung_sat.json", "missionType": "search_destroy", "night": true, "reward": 4,
        "overrides": { "vcCount": 7 } }
    ] }
  ],
  "rules": { "medevacChance": 0 },
  "translations": {
    "it": { "name": "La mia campagna", "description": "…",
            "ops": { "op1": { "name": "Operazione Mangrovia", "briefing": "…" }, "op2": { "name": "…" },
                     "op2_pilot": { "name": "…", "briefing": "…" }, "op2_raid": { "name": "…", "briefing": "…" } } },
    "en": { "…": "…" }
  }
}
```

- Un'**operazione** è una missione (`map` in `missions/` oppure `generator` + `size`, `missionType`, `night`, `reward`) o un elenco `choices` di missioni tra cui scegliere.
- **`overrides`** cambia i campi della mappa per quell'operazione (VC, rinforzi, composizione, armi, `tuning`…), uniti come il `tuning`.
- **`difficulty`** è una curva tra la prima e l'ultima operazione (`vcCount`, `reinforcementTurn`, `vcMix`), applicata prima degli `overrides`.
- **`procedural`** al posto di `operations` genera le operazioni dal seed (numero, scelte, generatori, tipi di missione, probabilità di notte).
- **`rules`** cambia le regole: plotone, XP, gradi, convalescenza, evacuazione, PR, costi, dotazioni, livelli e pressione. `"medevacChance": 0` = morte sempre definitiva.

Tutti i campi sono nella [guida ai campi](docs/FIELDS.md#campaign); `node tools/validate.js --all` controlla anche le campagne (mappe esistenti, tipi di missione giocabili sulla mappa, campi di `overrides`). Il simulatore gioca campagne intere col bot: `node tools/sim/run.js --campaign delta68 --games 20` (con `--variant` per confrontare regole diverse, es. `"CAMPAIGN_RULES.medevacChance=0.5"`).

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

### Immagine del menu

Su schermi ampi (almeno 900×560) il menu iniziale è a due colonne: a sinistra le voci **Riprendi**, **Addestramento**, **Missioni singole**, **Campagne** e **Opzioni** (lingua, audio, vento, mod, comandi), che si aprono con i loro elenchi; a destra un'immagine del gioco con titolo e versione, sopra cui compare il briefing della mappa scelta. Su mobile resta il menu a passi.

L'immagine di default è `assets/menu_hero.jpg` (una scena di gioco); si sostituisce con `menuImage`:

```json
{
  "menuImage": "assets/mia_copertina.jpg"
}
```

Viene ritagliata per riempire il riquadro e scurita in basso e a sinistra per far leggere il titolo: meglio un'immagine orizzontale, con il soggetto al centro.

### Immagini unità

Di base ogni pedina è un soldato visto dall'alto disegnato dal gioco: l'aspetto dipende dalla classe (elmetto e M16 per l'assalto, cappello boonie e fucile con ottica per il cecchino, radio sulla schiena per il geniere, croce rossa per il medico, cappello conico per i VC, elmetto di sughero per il comandante), la figura cambia con la postura (in piedi, accovacciato, sdraiato) e ruota verso dove guarda l'unità. Una classe nuova sceglie l'aspetto con il campo `sprite`.

Per sostituire il soldato disegnato con immagini proprie, inserire il percorso del file per ogni classe, una sola immagine oppure una per postura:

```json
{
  "unitImages": {
    "assault": "assets/assault.webp",
    "sniper":  { "stand": "assets/sniper.webp", "crouch": "assets/sniper_crouch.webp", "prone": "assets/sniper_prone.webp" }
  }
}
```

- L'immagine mostra il soldato **visto dall'alto, rivolto a nord (verso il lato alto dell'immagine)**, su sfondo trasparente, quadrata: il gioco la ruota verso dove guarda l'unità
- Nell'oggetto per postura, le posture mancanti usano l'immagine `stand`
- Formati supportati: **webp, png, jpg, svg**
- Lasciare la stringa vuota `""` per usare il soldato disegnato
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
    "stance":     "",
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
- `disarm` = disinnesco di una trappola da parte del geniere, `melee` = fendente del coltello, `reload` = ricarica, `stance` = cambio di postura
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

**Campi per arma:** tutti i campi, con valori ammessi e default, sono nella [guida ai campi](docs/FIELDS.md#weapon).

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
| Geniere | M16 (ATK2, RNG3, ∞) | Radio: artiglieria (salva di 5–6 colpi ATK4 AoE1 dispersi in 5×5, RNG10, ×1, max 1 per squadra), Radio: napalm (linea di max 5 tile, ATK4 senza copertura, RNG3–12, ×1, max 1 per squadra) |
| Medico | M1911 (ATK1, RNG1, ∞) | — |
| Guerrigliero VC | AK-47 (ATK2, RNG2, ∞) | RPG-7 (ATK4, RNG4, AoE1, ×1, max 1 portatore) |
| Cecchino VC | Mosin (ATK3, RNG4, ∞) | — |
| Comandante VC | TT-33 (ATK3, RNG2, ∞) | — |

### Classi della squadra

Le classi US si cambiano con `unitClasses` in `config.json`; con un nome nuovo si aggiunge una classe (parte dalle statistiche dell'assalto) che compare subito tra le scelte del briefing. Le sue armi vanno in `weapons` sotto lo stesso nome, l'immagine in `unitImages`.

```json
"unitClasses": {
  "medic": { "hp": 9 },
  "machinegunner": {
    "labels": { "it": { "name": "Mitragliere", "desc": "Fuoco pesante, lento" },
                "en": { "name": "Machine gunner", "desc": "Heavy fire, slow" } },
    "symbol": "MG", "color": "#6a6a6a", "hp": 11, "move": 2, "attack": 3, "defense": 1,
    "range": 3, "vision": 4, "special": "suppression", "sprite": "assault"
  }
},
"weapons": { "machinegunner": [{ "id": "m60", "label": "M60", "atk": 4, "range": 4, "mag": 2, "mags": 2, "noise": 7 }] }
```

Tutti i campi della classe sono nella [guida ai campi](docs/FIELDS.md#unit-class).

### Classi nemiche

Le statistiche dei VC si cambiano con `enemyClasses` in `config.json`; con un nome nuovo si aggiunge una classe (parte dai valori del guerrigliero). Le sue armi vanno in `weapons` sotto lo stesso nome, e l'immagine in `unitImages`. Per farla comparire in partita va inserita in una composizione: `vcMix` in `config.json` (default per tutte le mappe) oppure `vcMix`/`ambushMix`/`reinforcementMix` nella mappa.

```json
"enemyClasses": {
  "commander": { "hp": 9 },
  "nva": { "name": { "it": "Regolare NVA", "en": "NVA Regular" }, "role": "rifleman",
           "hp": 7, "attack": 3, "defense": 1, "sprite": "nva" }
},
"vcMix": { "spawn": { "grunt": 3, "sniper_vc": 1, "commander": 1, "nva": 1 } },
"weapons": { "nva": [{ "id": "ak47", "label": "AK-47", "atk": 3, "range": 3, "noise": 5, "sound": "assets/ak47.mp3" }] }
```

Tutti i campi della classe sono nella [guida ai campi](docs/FIELDS.md#enemy-class).

In `config.json`, `vcMix` ha tre composizioni: `spawn` (schieramento iniziale), `ambush` (imboscata), `reinforcement` (rinforzi).

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
- **`until`:** è `"next"` (bottone Avanti) oppure un evento, con campi da confrontare ed eventualmente `at` / `within` sulla posizione. Gli eventi sono `select`, `move`, `rotate`, `stance`, `attack`, `kill`, `aoe`, `reload`, `firstaid`, `special` (con `kind`: `overwatch`, `suppression`, `heal`, `disarm`, `demolish`, `burn`, `seal`), `trapFound`, `tunnelFound`, `endTurn`, `turnStart`.
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

Esempio con i campi principali (tutti i campi, con valori ammessi e default, sono nella [guida ai campi](docs/FIELDS.md#map)):

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

### Altri campi della mappa

Trappole, tunnel, notte, meteo, squadra e VC in posizione fissa, imboscate e rinforzi: l'elenco completo è nella [guida ai campi](docs/FIELDS.md#map).

### Campi opzionali: armi, nemici e bilanciamento

Valgono solo per la missione della mappa: alla missione successiva tornano i valori di `config.json` e del gioco.

I campi sono descritti nella [guida ai campi](docs/FIELDS.md#map); i valori modificabili con `tuning`, gruppo per gruppo, nella sezione [Gruppi di `tuning`](docs/FIELDS.md#tuning).

```json
"weapons": {
  "assault": { "grenade": { "ammo": 4 }, "smoke": null },
  "medic": [{ "id": "shotgun", "label": "Ithaca 37", "atk": 3, "range": 1, "noise": 4 }]
},
"vcMix": { "grunt": 2, "nva": 3, "commander": 1 },
"reinforcementMix": { "nva": 1 },
"tuning": {
  "VC_TACTICS": { "holdChance": 0.8 },
  "ENEMY_CLASSES": { "commander": { "hp": 10 } },
  "STANCES": { "prone": { "def": 3 } }
}
```

### Campi del tile type

Vedi la [guida ai campi](docs/FIELDS.md#tile).

### Tipi di obiettivo

Gli obiettivi stanno in `objectives`, uno per tipo di missione (`recon`, `search_destroy`, `rescue_pilot`, `capture_objective`; campi nella [guida ai campi](docs/FIELDS.md#map)). Puoi includere solo i tipi che vuoi supportare e dichiararli in `supportedMissions`.

### File opzionali

| File | Descrizione |
|---|---|
| `missions/mia_mappa.jpg` | Immagine di sfondo (sostituisce i tile colorati); dichiarata con `"image": "mia_mappa.jpg"` |
| `missions/mia_mappa_ambient.ogg` | Musica ambientale in loop durante la partita |
| `"sounds": { "move": "..." }` | SFX specifici per questa mappa (sovrascrivono `config.json`) |

### Controllare una mappa

Al caricamento il gioco controlla la mappa. Se ci sono **errori** (griglia che non torna con `cols`/`rows`, carattere della griglia assente da `tileTypes`, coordinate fuori mappa, obiettivi non raggiungibili dalla partenza, classi o tile inesistenti, JSON non valido…) la mappa non parte e il briefing li elenca con il percorso del campo (es. `tileTypes.J.moveCost`). Gli **avvisi** (campi sconosciuti, spesso refusi, con il nome più vicino; colori o texture non validi; traduzioni mancanti) vanno nella console del browser e la mappa parte lo stesso. Anche `config.json` e il catalogo vengono controllati all'avvio, con i risultati in console.

Gli stessi controlli, più l'esistenza dei file citati (immagini, suoni, musiche), si eseguono senza aprire il gioco (serve Node.js):

```
node tools/validate.js missions/mia_mappa.json
node tools/validate.js --all
```

`--all` controlla `config.json`, il catalogo e le sue mappe, le lezioni del tutorial e le mappe procedurali su più seed; `--lang en` dà i messaggi in inglese. Esce con codice 1 se trova errori.

Mentre si scrive, i JSON Schema in `schemas/` danno nell'editor l'autocompletamento dei campi, la loro descrizione e gli stessi controlli di tipo: VS Code li usa da solo, gli altri editor (Zed, JetBrains…) con `"$schema": "../schemas/mission.schema.json"` in cima alla mappa. La [guida ai campi](docs/FIELDS.md) e gli schemi si generano da `js/schema.js` con `node tools/schema-docs.js`.

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

---

## Mod

Una mod raccoglie in una cartella sua classi, armi, nemici e mappe, senza toccare `config.json`, il catalogo o i file del gioco. Si attiva dal menu iniziale con il pulsante **🧩 Mod**, che compare quando ce n'è almeno una: le scelte valgono dal caricamento successivo della pagina (il pulsante **Applica e ricarica** lo fa subito) e restano ricordate nel browser. Una partita salvata con delle mod si riprende solo con quelle mod attive.

```
mods/
  index.json              elenco delle mod: { "mods": ["nva_regulars"] }
  nva_regulars/
    mod.json              descrizione, aggiunte a config.json, mappe, campagne
    avamposto.json        una mappa della mod
    campaign.json         una campagna della mod
```

L'elenco in `mods/index.json` serve perché il gioco, da sito statico, non può leggere il contenuto di una cartella; l'ordine è quello in cui le mod si applicano (se due cambiano la stessa cosa vince l'ultima).

```json
{
  "labels": {
    "it": { "name": "Regolari NVA", "desc": "Regolari nordvietnamiti nei rinforzi, più una mappa" },
    "en": { "name": "NVA Regulars", "desc": "North Vietnamese regulars in the reinforcements, plus a map" }
  },
  "author": "Io",
  "version": "1.0",
  "config": {
    "enemyClasses": { "nva": { "name": { "it": "Regolare NVA", "en": "NVA Regular" }, "role": "rifleman", "hp": 7, "attack": 3, "sprite": "nva" } },
    "weapons": { "nva": [{ "id": "ak47", "label": "AK-47", "atk": 3, "range": 3, "sound": "../../assets/ak47.mp3" }] },
    "vcMix": { "reinforcement": { "nva": 1 } }
  },
  "maps": [
    { "file": "avamposto.json", "icon": "⭐", "labels": { "it": { "label": "Avamposto NVA", "subtitle": "Altopiani · 1968" } } }
  ]
}
```

- **`config`** ha gli stessi campi di `config.json` e si aggiunge a quello: classi e composizioni vengono unite, immagini e suoni sostituiti per chiave, le armi seguono le regole del campo `weapons` delle mappe (un array sostituisce il loadout della classe, un oggetto cambia le armi per `id`).
- **`maps`** ha le stesse voci di `missions/catalog.json`; `file` è il JSON della mappa nella cartella della mod. Le mappe delle mod sono mappe normali e possono usare le classi della mod.
- **`campaigns`** elenca le [campagne](#campagna) della mod, JSON nella sua cartella (`"campaigns": ["campaign.json"]`); il loro `map` parte da lì, quindi una mappa del gioco si cita con `"../../missions/hue_city.json"`.
- **I percorsi** in `mod.json` e nelle sue mappe (immagini, suoni, musiche, texture, `image`) partono dalla cartella della mod; `../../` risale alla cartella del gioco, per riusarne i file (`"../../assets/ak47.mp3"`).

La mod d'esempio `mods/nva_regulars/` mostra tutte le parti. Una mod con errori (campi sbagliati, classi inesistenti, file mancanti) non viene applicata: il menu delle mod mostra il primo errore e la console del browser l'elenco completo. `node tools/validate.js --all` controlla anche le mod e le loro mappe; tutti i campi di `mod.json` sono nella [guida ai campi](docs/FIELDS.md#mod).
