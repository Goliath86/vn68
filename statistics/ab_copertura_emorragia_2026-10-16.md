# Test A/B — Copertura ed emorragia — 2026-10-16

Seguito di `simulazioni_2026-10-16.md`: problemi P4 (combattimento letale, copertura che conta poco)
e P5 (31% dei caduti muore dissanguato). Simulatore `tools/sim/`, 6 mappe (Giungla S/M, Città S/M,
Rung Sat, Hue City), missioni a rotazione, 60 partite per mappa per variante: **360 partite per variante**,
stessi seed per tutte. Rumore statistico circa ±3 punti sul totale. Il codice del gioco non è stato modificato:
le varianti sono iniettate con `--variant`. Come sempre il bot è più debole di un umano e **usa la copertura
peggio di un giocatore**: contano i delta.

**Sconfitta rapida** = sconfitta con meno del 30% dei VC eliminati, cioè partita decisa dai primi scontri.

## Varianti

- **cov2x**: la copertura conta doppio in difesa, per entrambe le parti. Con la formula attuale equivale
  esattamente a "la copertura riduce il danno di 1 per punto": un colpo va a segno solo se il danno è > 0,
  quindi aggiungere la riduzione alla difesa o toglierla dal danno dà lo stesso risultato.
- **cov+1**: +1 alla copertura sui tile che ne hanno già, per entrambe le parti.
- **cov2xUS**: copertura doppia solo per i soldati US.
- **vcAtk-1**: attacco delle armi VC −1 (riferimento: una pura riduzione di difficoltà).
- **stop33 / stop50**: a ogni inizio turno un'emorragia si ferma da sola con probabilità 1/3 o 1/2,
  e in quel caso non fa danno.
- **bleedHalf**: probabilità che un colpo causi emorragia circa dimezzata (dal 35–80% al 17–40%).

## Risultati (totale delle 6 mappe)

| Variante | Vittorie | Sconfitte rapide | Turni | Caduti | Morti dissanguati | Prec. VC | Prec. US |
|---|---|---|---|---|---|---|---|
| base | 36% | 25% | 14.8 | 3.16 | 32% | 85% | 89% |
| cov2x | 34% | 26% | 15.4 | 3.11 | 31% | 77% | 79% |
| cov+1 | 34% | 24% | 15.1 | 3.10 | 32% | 82% | 84% |
| cov2xUS | 42% | 19% | 15.3 | 2.96 | 37% | 78% | 90% |
| vcAtk-1 | 40% | 18% | 16.0 | 3.01 | 36% | 78% | 88% |
| **stop33** | **43%** | **18%** | 16.1 | 2.84 | **14%** | 86% | 89% |
| stop50 | 44% | 17% | 16.4 | 2.78 | 9% | 86% | 89% |
| bleedHalf | 40% | 21% | 15.7 | 3.01 | 20% | 85% | 89% |
| stop33+cov2xUS | 47% | 15% | 16.8 | 2.65 | 15% | 78% | 89% |
| stop33+cov2x | 40% | 20% | 17.1 | 2.88 | 14% | 77% | 80% |

Vittorie % per tipo di missione:

| Variante | Ricognizione | Ricerca e distr. | Pilota | Conquista |
|---|---|---|---|---|
| base | 21 | 59 | 33 | 29 |
| cov2x | **12** | 58 | 32 | 33 |
| cov+1 | **11** | 62 | 32 | 32 |
| cov2xUS | 24 | 66 | 38 | 40 |
| stop33 | 23 | 72 | 40 | 38 |
| stop50 | 26 | 71 | 42 | 38 |
| stop33+cov2xUS | 26 | 77 | 43 | 42 |

## Conclusioni

**Copertura.** Rafforzarla per entrambe le parti non aiuta la squadra: la precisione scende di
8–10 punti su tutti e due i lati, ma i VC (l'IA tattica sceglie i tile coperti) ne approfittano quanto
gli US. Le vittorie restano uguali o scendono di poco, e la Ricognizione crolla (dal 21% all'11–12%):
la squadra deve muoversi allo scoperto mentre i VC aspettano al riparo. Una copertura più forte
**solo per gli US** (cov2xUS, +6) funziona, ma è una regola asimmetrica: di fatto equivale a
indebolire i VC (vcAtk-1, +4). È un cambio di difficoltà, non di profondità tattica.

**Emorragia.** È la leva più efficace e più pulita:
- **stop33**: vittorie dal 36% al 43%, sconfitte rapide dal 25% al 18%, morti dissanguati dal 32% al 14% dei caduti.
  L'emorragia resta una minaccia (2.5 HP a partita invece di 5.2), ma non è più una condanna quasi certa
  quando il medico è lontano.
- stop50 dà poco in più (+1 punto) e rende l'emorragia quasi irrilevante (9% dei caduti).
- bleedHalf funziona meno bene (+4) perché le emorragie, quando partono, restano letali.

**Raccomandazione:** implementare **stop33**, cioè ogni emorragia ha 1 probabilità su 3 di fermarsi da sola a inizio
turno, senza danno quel turno. La copertura va lasciata com'è. Se dopo il playtest il gioco resta troppo punitivo,
la combinazione con cov2xUS porta al 47%, ma col giocatore umano (che usa la copertura meglio del bot)
probabilmente renderebbe le partite troppo facili.

## Implementazione

Implementato stop33: `mechanics.js:tickBleeding` con `BLEED_STOP_CHANCE` = 1/3 e il campo mappa opzionale
`bleedStopChance`, impostato a 0 nella lezione 5 del tutorial perché resti deterministica. Messaggio nel log
e contatore "fermate da sole" nelle statistiche di fine missione. Verifica col codice modificato (Giungla S,
60 partite): 58% di vittorie e 16% di caduti dissanguati, come la variante del test.
