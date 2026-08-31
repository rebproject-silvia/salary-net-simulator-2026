# TEST REPORT — V0.9 Submission Candidate

Verifiche mirate eseguite localmente il 31/08/2026 dopo le correzioni autorizzate.
Ambiente: Node.js 24.19.0, Python 3.12.13, Windows; CI configurata con Node.js 22 e Python 3.12.
Non è stata eseguita una run remota di GitHub Actions né un nuovo audit generale.

## Esito

PASS per le suite e le verifiche mirate descritte sotto.
Successivamente, la V0.9 è stata sottoposta a un audit tecnico indipendente nel perimetro
della take-home task, con verdetto finale **READY** e nessun finding P0/P1 bloccante.
Dopo l'audit sono state applicate soltanto modifiche di presentazione per la pubblicazione GitHub
(README, firma/footer e asset del logo REB Project); motore fiscale e ruleset sono rimasti invariati.
Le sei suite locali elencate sotto sono state rieseguite dopo tali modifiche con esito PASS.

## Suite eseguite

| Comando | Esito |
|---|---|
| `python -B scripts/validate_rules.py` | PASS: ruleset approvato e fingerprint coerenti |
| `node scripts/test_rules_js.cjs` | PASS: uguaglianza semantica JSON/JS, divergenza fiscale e NaN rifiutati; nessuna sincronizzazione |
| `node scripts/test_app_js.cjs` | PASS: motore reale, DOM ricavato dall'HTML, submit 13/14, importi visualizzati e mutazioni negative |
| `python -B scripts/test_engine.py` | PASS: 510 RAL, 1.020 casi 13/14, tutti i campi confrontati con il JavaScript |
| `python -B scripts/test_engine.py --full-euros` | PASS: 45.052 RAL, 90.104 casi 13/14, nessuna differenza |
| `python -B scripts/test_ui.py` | PASS: HTML/ARIA, riferimenti DOM, limiti input, CSS focus e testi review-only |
| `python -B scripts/test_watch_rules.py` | PASS: 13 test, risposte simulate e scritture intercettate |

Il confronto esteso comprende tutte le 45.001 RAL a euro intero tra 5.000 e 50.000 €,
più i casi al centesimo intorno alle soglie e i valori di regressione.
Non è una nuova scansione di tutti i 4.500.001 centesimi eseguita durante l'audit V0.8.

Sintassi verificata con `node --check` per `app.js`, `data/rules.js` e i tre file `scripts/*.cjs`.
Verificati con `ast.parse` tutti i sei file Python, senza generare bytecode.

## F1 — Test frontend e numerici

- `eq()` rifiuta undefined, null, NaN, Infinity, -Infinity, stringhe, booleani, oggetti, array e bigint
  quando si aspetta un numero; verifica anche il valore atteso.
- Gli elementi di test derivano da `index.html`. ID mancanti restituiscono null, non elementi inventati.
- Eseguito il percorso RAL 40.000 → radio 14 → submit reale → netto annuo 27.960,18 €
  e media 1.997,16 € nel DOM; ritorno a 13 → stesso annuo e media 2.150,78 €.
- Verificati input vuoto, sotto minimo, sopra massimo e oltre due decimali.
- Mutazioni in memoria: listener submit scollegato, valore detrazione mancante,
  app inutilizzabile ed elemento HTML rimosso vengono rilevati.
- Verificati il riepilogo con ID ruleset e il fallback della clipboard con API simulata.
- Il piccolo DOM di test non è un browser completo; non vengono dichiarati test end-to-end
  di tastiera, clipboard nativa o accessibilità completa.

## F2/F3 — Coerenza e oracolo

JSON e copia JavaScript sono confrontati semanticamente in uno step CI obbligatorio.
Il controllo non esegue `sync_rules_js.py` e non scrive file fiscali.
Una modifica isolata 33% → 35% nella copia JavaScript viene rifiutata.

Il Python acquisisce i numeri JSON come Decimal e mantiene Decimal in tutte le operazioni.
Conversioni da float sono rifiutate. Restano half-up, troncamento a quattro decimali e ordine
delle operazioni del modello. Il ponte `test_app_js.cjs --cases` esegue il JavaScript reale.

Le soglie testate includono imponibili 8.500, 15.000, 20.000, 23.000, 25.000, 28.000,
32.000, 35.000 e 40.000 €, oltre alle condizioni di ingresso del trattamento integrativo
e dell'addizionale regionale, con due centesimi prima e dopo i confini individuati.

## Valori ottenuti dal JavaScript corrente

Il netto annuo è identico con 13 e 14 mensilità.

| RAL | Netto annuo | Media 13 | Media 14 |
|---:|---:|---:|---:|
| 5.000,00 € | 4.862,88 € | 374,07 € | 347,35 € |
| 5.049,00 € | 4.910,54 € | 377,73 € | 350,75 € |
| 5.450,00 € | 5.300,53 € | 407,73 € | 378,61 € |
| 25.327,61 € | 20.766,77 € | 1.597,44 € | 1.483,34 € |
| 25.327,62 € | 20.582,78 € | 1.583,29 € | 1.470,20 € |
| 30.000,00 € | 23.425,49 € | 1.801,96 € | 1.673,25 € |
| 50.000,00 € | 32.567,65 € | 2.505,20 € | 2.326,26 € |

Ulteriori regressioni:
- RAL 5.049 €: imponibile 4.585 €, bonus 325,54 € in entrambi i motori;
- RAL 5.450 €: contributi 500,86 €;
- RAL 30.000 €: detrazione lavoro 2.044,26 €;
- soglia Milano: addizionale da 0 a 184 €, salto netto -183,99 €.

## F4 — Watcher review-only

Corrette esclusivamente le regex con escape doppi; aggiornato lo User-Agent alla V0.9.
Logica di classificazione, policy di scrittura, allow-list e workflow watcher sono invariati.

Fixture positive:
- frase ordinaria «Anno 2026 esenzione 23.000 euro aliquota 0,8%»;
- variante con simbolo euro, centesimi e spazio prima della percentuale.

Le fixture positive estraggono 23000 e 0.008; Milano risulta `matches_approved_rules`.
L'esito tecnico `checked_no_auto_change` non è un'approvazione fiscale.

Casi ostili con `review_required`:
- valori storici diversi insieme a quelli 2026;
- solo anno 2025;
- HTTP 200 con pagina di manutenzione sulla fonte Milano;
- risposta troppo breve;
- redirect non istituzionale;
- destinazione finale non istituzionale;
- valore plausibile diverso;
- valore fuori range;
- valori discordanti per lo stesso anno;
- rete indisponibile.

In tutti i casi gli unici tentativi di scrittura ammessi sono quelli del report,
intercettati in memoria. Verificati invariati JSON, copia JavaScript e approvedAt.
Confermati `contents: read` e assenza di sincronizzazione/push nel workflow watcher.

La fixture distribuita `reports/regulatory_status.json` è stata rigenerata dall'esecuzione
simulata «rete indisponibile», poi marcata `fixture: true`, `fixtureVersion: V0.9` e
`checkedAt: null`. Non documenta una verifica online.
Il watcher non è stato eseguito contro Internet.

## F6/F7/F8 — Testi, spiegazioni e HTML

- Rimossi i claim positivi di aggiornamento normativo automatico dall'interfaccia.
- Distinti ruleset approvato, ultimo controllo tecnico e revisione richiesta.
- Spiegazioni contestuali: trattamento con confronto IRPEF/detrazione meno 75 €;
  supplemento 65 € con intervallo di reddito; capienza quando limita le detrazioni;
  soglie effettivamente utilizzate per bonus/addizionali.
- Nessuna spiegazione di ulteriore detrazione o supplemento 65 € nei casi non applicabili.
- Corrette le virgolette della section comparison-panel e verificato aria-labelledby separato.
- Test negativo HTML: reintrodurre in memoria la virgoletta mancante fa fallire il controllo.

Verifica mirata nel browser:
- RAL 40.000, 14 mensilità: annuo 27.960,18 €, media 1.997,16 €;
- RAL 5.000: capienza limitata, eccedenza non rimborsabile 910,68 €;
- RAL 10.000: confronto 2.088,63 € > 1.955 € - 75 € = 1.880 €;
- RAL 30.000: condizione 25.000 € < 27.243 € ≤ 35.000 € per i 65 €;
- dettagli espandibili e regione accessibile del confronto presenti;
- nessun errore JavaScript rilevato nei percorsi verificati.
Per questa verifica mirata è stata usata la skill Browser; non è stato effettuato un redesign.

## Perimetro preservato e limiti rimasti

Durante le correzioni V0.9 precedenti all'audit, gli hash SHA-256 confermavano invariati il blocco
delle funzioni fiscali JavaScript, la validazione/API tecnica, `data/rules-2026.json`, `data/rules.js`
e lo stylesheet. Dopo il verdetto READY è stato aggiunto soltanto CSS di presentazione per il footer
REB Project; nessuna formula fiscale, regola o soglia è stata modificata. Il confronto del sorgente
watcher confermava che le correzioni funzionali riguardavano soltanto gli escape regex e lo User-Agent.

- Range invariato 5.000–50.000 €, nessun contributo aggiuntivo dell'1%, nessun nuovo profilo.
- Ruleset invariato `IT-MI-2026.08-b78ba29f`, approvazione invariata 31/08/2026.
- F5 non corretto per il vincolo di modifica del solo bug regex: restano le limitazioni
  semantiche e dei redirect descritte nel README e nell'audit precedente.
- F10 e F11 non modificati, esplicitamente accettati come non bloccanti.
- V0.8 nel changelog e nel prompt di audit conservato indica documentazione storica,
  non la versione applicativa corrente.
- L'audit indipendente finale è stato completato con verdetto READY; resta separata un'eventuale verifica online delle fonti.
