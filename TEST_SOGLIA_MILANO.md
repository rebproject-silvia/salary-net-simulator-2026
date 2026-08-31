# Test soglia addizionale comunale Milano — V0.9 Submission Candidate

Valori rieseguiti sul JavaScript reale il 31/08/2026, ruleset `IT-MI-2026.08-b78ba29f`.

Profilo del prototipo:
- dipendente privato;
- tempo indeterminato;
- Milano;
- quota previdenziale standard 9,19%;
- regole locali correnti indicate dal Comune di Milano.

## Caso limite atteso

| RAL | Contributi | Imponibile | Addizionale Milano | Netto annuo |
|---:|---:|---:|---:|---:|
| 25.327,61 € | 2.327,61 € | 23.000,00 € | 0,00 € | 20.766,77 € |
| 25.327,62 € | 2.327,61 € | 23.000,01 € | 184,00 € | 20.582,78 € |

Nel modello, +0,01 € di RAL oltre il punto limite produce circa -183,99 € di netto annuo,
perché l'esenzione comunale non è una franchigia.

Le suite JavaScript e Decimal verificano questi importi e il salto di -183,99 €.
Con 13 o 14 mensilità gli importi annui e l'addizionale non cambiano.

Questo test serve a verificare la continuità/discontinuità del motore e non costituisce
consiglio fiscale o retributivo.
