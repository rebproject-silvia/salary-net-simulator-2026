# Calcola il tuo stipendio n€tto — 2026

Prototipo sviluppato come take-home task per un simulatore **Retribuzione Annua Lorda → netto** su un caso standard: dipendente privato, tempo indeterminato, residente fiscalmente a Milano, senza agevolazioni personali particolari.

## Come ho affrontato questa task

Il caso di partenza era già volutamente semplice e delimitato. La mia scelta è stata non trattarlo come un semplice esercizio di calcolo: volevo che il risultato fosse **comprensibile e verificabile**, non soltanto corretto.

Per questo ho aggiunto il confronto tra 13 e 14 mensilità, reso visibile il percorso dalla Retribuzione Annua Lorda al netto e messo in evidenza le soglie che possono produrre effetti poco intuitivi.

Ho inoltre separato le regole fiscali dal motore di calcolo e predisposto un controllo periodico delle fonti istituzionali. Il watcher è **review-only**: può rilevare possibili cambiamenti, ma non modifica mai automaticamente un ruleset approvato senza revisione umana.

Prima di considerare il prototipo pronto, l'ho sottoposto a test di regressione e a un audit tecnico indipendente con Codex. Il verdetto finale è stato **READY**, senza finding P0/P1 bloccanti nel perimetro della take-home task.

Questo progetto rappresenta bene il mio modo di lavorare: partire dal problema, costruire presto, verificare, correggere e rendere espliciti sia il risultato sia i limiti del sistema.

## Il prototipo

**Input**
- Retribuzione Annua Lorda da **5.000 € a 50.000 €**;
- 13 oppure 14 mensilità.

**Output**
- netto annuo stimato;
- netto medio per mensilità;
- contributi del lavoratore;
- imposte totali;
- dettaglio di imponibile, IRPEF, detrazioni e addizionali;
- formule, valori applicati e fonti istituzionali.

La scelta tra 13 e 14 mensilità cambia soltanto la **media matematica per mensilità**, non il netto annuo stimato.

## Trasparenza prima della falsa precisione

Il simulatore non tenta di ricostruire una busta paga reale o di coprire tutti i contratti collettivi. Il profilo è volutamente quello richiesto dalla task e i limiti sono dichiarati nell'interfaccia.

La sezione **“Spiegami questo risultato”** permette di vedere come si arriva al numero e quali regole vengono applicate. Vicino a soglie rilevanti l'interfaccia mostra anche eventuali discontinuità, invece di nasconderle dentro il risultato finale.

## Regole fiscali e watcher

Le regole sono esterne al motore e versionate:

- ruleset: `IT-MI-2026.08-b78ba29f`;
- approvato: **31/08/2026**;
- `data/rules-2026.json` è confrontato semanticamente con la copia usata dal browser;
- il watcher controlla fonti istituzionali in modalità **review-only**;
- nessuna variazione rilevata aggiorna automaticamente le regole approvate.

## Test

La suite verifica il JavaScript realmente usato dall'applicazione, la coerenza del ruleset, il frontend, l'oracolo Python con `Decimal` e il comportamento offline del watcher.

Nel confronto esteso sono stati verificati **45.052 valori di RAL**, per entrambe le scelte 13/14, quindi **90.104 casi**, senza divergenze tra motore JavaScript e oracolo Decimal.

Dettagli e regressioni: [`TEST_REPORT.md`](TEST_REPORT.md).

Dopo il verdetto READY sono state aggiunte soltanto modifiche di presentazione (README, firma/footer e logo REB Project), senza modificare motore fiscale o ruleset. Le suite locali sono state rieseguite con esito PASS.

Per eseguire le suite locali:

```bash
python -B scripts/validate_rules.py
node scripts/test_rules_js.cjs
node scripts/test_app_js.cjs
python -B scripts/test_engine.py
python -B scripts/test_ui.py
python -B scripts/test_watch_rules.py
```

## Avvio

Non è richiesta installazione.

Aprire semplicemente:

```text
index.html
```

Il progetto è composto da HTML, CSS e JavaScript vanilla; gli script Python e Node sono usati per test, validazione e monitoraggio.

## Limiti

È una simulazione indicativa costruita per il perimetro della take-home task. Non sostituisce un cedolino, un software payroll o una consulenza fiscale/del lavoro.

---

**Built by Silvia Contarelli · REB Project**
