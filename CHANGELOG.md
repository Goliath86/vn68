# Changelog

## 1.1.5 — 28/10/2026

### Novità
- **Click contestuale su desktop**: senza scegliere l'azione, un click su un tile raggiungibile muove il soldato e un click su un VC a tiro spara, con anteprima di percorso e costo. Il click destro annulla l'azione e ruota il soldato verso il punto.
- **Campo visivo**: contorno di ciò che vede davvero il soldato selezionato, velo sui tile visti solo dai compagni, linee "chi vede chi" passando col mouse su soldati e VC. Etichette colorate sui contorni della mappa.
- **Animazioni**: camminata dei soldati con girata morbida e velocità dei movimenti regolabile, rinculo allo sparo e sobbalzo del colpito, cambio di postura animato, gesti per lancio, radio, bende e lavori del geniere.
- **Terreno che reagisce ai passi**: schizzi nell'acqua, fronde che si muovono nella giungla, polvere sul resto.

### Audio
- Passi diversi per ogni tipo di terreno (guado, palude e altri), suono dell'overwatch e del fuoco soppressivo, stormo di uccelli.
## 1.1.0 — 25/10/2026

### Novità
- **Campagna / plotone**: plotone persistente di 8 soldati (4 schierati per operazione), ferite che tengono fuori dal servizio, caduti definitivi e muro dei caduti. Esperienza e gradi (Pvt → Sgt) con punti ferita e perk, punti requisizione per rimpiazzi, cure e dotazioni. Operazioni facili/normali/difficili con pressione VC crescente. Due campagne: *Delta '68* (fissa) e una procedurale generata dal seed.
- **Nuove pedine**: soldati disegnati visti dall'alto al posto dei ritratti, con aspetto per classe, postura, orientamento, ombra e caduta alla morte.
- **Animazioni dei soldati**: respiro, sguardi intorno, perlustrazione, controllo dell'arma e ricarica (disattivabili dalle Opzioni).
- **Menu desktop rinnovato**: voci a fisarmonica a sinistra, immagine con titolo e versione a destra, briefing in scheda. Su mobile resta il menu a passi.

### Audio
- Nuovi effetti: ricarica, cambio di postura, fumogeno, demolizioni, disinnesco trappole, corpo a corpo, rinforzi VC, jet e fiamme del napalm, vittoria e sconfitta.
- Ambiente urbano e passi sulle strade per Hue City e Città Ignota.

### Modding
- Campagne nelle mod (esempio in *nva_regulars*), `perks` e `soldierNames` in `config.json`.
- `unitImages` accetta un'immagine vista dall'alto o una per postura (`stand`/`crouch`/`prone`); campo `sound` dei terreni per passi diversi a seconda del terreno; `menuImage` per l'immagine del menu.

### Altro
- Rung Sat senza immagine di sfondo: ora usa il terreno disegnato dal gioco.
