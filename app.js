'use strict';

/*
  SIMULATORE STIPENDIO NETTO 2026 — V0.9 SUBMISSION CANDIDATE

  Caso modellato e verificato:
  - dipendente privato, tempo indeterminato, intero anno
  - residente fiscalmente a Milano
  - unico reddito da lavoro dipendente
  - nessuna agevolazione personale
  - RAL supportata: 5.000–50.000 €
  - profilo contributivo semplificato FPLD: 9,19%

  Le regole fiscali sono esterne al motore. Il watcher è review-only:
  non modifica mai automaticamente il ruleset approvato.
*/

const CONFIG = window.TAX_RULES;
if (!CONFIG) throw new Error('Ruleset fiscale non caricato.');

const euro = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function roundMoney(value) {
  // Politica esplicita: arrotondamento commerciale al centesimo (half-up)
  // per importi non negativi del modello.
  return Math.floor((value + 1e-10) * 100 + 0.5) / 100;
}

function cents(value) {
  return roundMoney(value);
}

function truncate4(value) {
  return Math.floor((value + 1e-12) * 10000) / 10000;
}

/*
  Cerca il primo centesimo di RAL che produce un imponibile fiscale
  superiore alla soglia indicata. È intenzionalmente calcolato dal motore,
  non hard-coded, così se cambiano i contributi cambia anche la RAL-soglia.
*/
function firstGrossAboveTaxableThreshold(targetTaxable) {
  let low = CONFIG.input.minGross;
  let high = CONFIG.input.maxGross;

  // Binary search al centesimo.
  let lowCents = Math.round(low * 100);
  let highCents = Math.round(high * 100);

  while (lowCents < highCents) {
    const mid = Math.floor((lowCents + highCents) / 2);
    const gross = mid / 100;
    const contributions = employeeContributions(gross);
    const taxable = roundMoney(Math.max(0, gross - contributions));

    if (taxable > targetTaxable) highCents = mid;
    else lowCents = mid + 1;
  }

  return lowCents / 100;
}

function milanThresholdScenario(months) {
  const aboveGross = firstGrossAboveTaxableThreshold(CONFIG.milanMunicipal.exemption);
  const belowGross = cents(aboveGross - 0.01);

  const below = calculateSalary(belowGross, months);
  const above = calculateSalary(aboveGross, months);

  return {
    below,
    above,
    grossJump: cents(aboveGross - belowGross),
    netDelta: cents(above.netAnnual - below.netAnnual),
    taxDelta: cents(above.municipal - below.municipal)
  };
}

function renderSensitiveThreshold(result) {
  const scenario = milanThresholdScenario(result.months);
  const thresholdGross = scenario.above.grossAnnual;
  const distance = cents(result.grossAnnual - thresholdGross);
  const absDistance = Math.abs(distance);
  const panel = document.getElementById('threshold-panel');
  const NEAR_THRESHOLD_EUROS = CONFIG.input.nearThresholdWindow;

  panel.hidden = absDistance > NEAR_THRESHOLD_EUROS;
  if (panel.hidden) return;

  setText('threshold-gross-below', euro.format(scenario.below.grossAnnual));
  setText('threshold-taxable-below', euro.format(scenario.below.taxable));
  setText('threshold-tax-below', euro.format(scenario.below.municipal));
  setText('threshold-net-below', euro.format(scenario.below.netAnnual));

  setText('threshold-gross-above', euro.format(scenario.above.grossAnnual));
  setText('threshold-taxable-above', euro.format(scenario.above.taxable));
  setText('threshold-tax-above', euro.format(scenario.above.municipal));
  setText('threshold-net-above', euro.format(scenario.above.netAnnual));

  const chip = document.getElementById('threshold-chip');

  if (absDistance <= 500) {
    chip.textContent = 'Soglia vicina';
    document.getElementById('threshold-panel').classList.add('threshold-near');

    if (distance < 0) {
      setText(
        'threshold-summary',
        `La RAL inserita è circa ${euro.format(absDistance)} sotto la prima RAL che, nel modello, supera l'esenzione comunale di Milano.`
      );
    } else if (distance > 0) {
      setText(
        'threshold-summary',
        `La RAL inserita è circa ${euro.format(absDistance)} sopra la prima RAL che, nel modello, supera l'esenzione comunale di Milano.`
      );
    } else {
      setText(
        'threshold-summary',
        `La RAL inserita coincide con il primo centesimo che, nel modello, porta l'imponibile oltre ${euro.format(CONFIG.milanMunicipal.exemption)}.`
      );
    }
  } else {
    chip.textContent = 'Caso limite individuato';
    document.getElementById('threshold-panel').classList.remove('threshold-near');
    setText(
      'threshold-summary',
      `Nei test abbiamo individuato una discontinuità: intorno a ${euro.format(thresholdGross)} di RAL, nel nostro profilo standard, l'imponibile supera ${euro.format(CONFIG.milanMunicipal.exemption)} e può scattare l'addizionale comunale di Milano.`
    );
  }

  const lost = Math.abs(scenario.netDelta);
  setText(
    'threshold-impact-title',
    `${euro.format(scenario.grossJump)} lordi in più → circa ${euro.format(lost)} netti in meno nel caso limite`
  );
  setText(
    'threshold-impact-text',
    `Nel confronto automatico l'addizionale comunale passa da ${euro.format(scenario.below.municipal)} a ${euro.format(scenario.above.municipal)}. È l'effetto di una soglia di esenzione, non di una franchigia.`
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function employeeContributions(grossAnnual) {
  return roundMoney(grossAnnual * CONFIG.employeeContributions.standardRate);
}

function progressiveTax(income, brackets) {
  if (income <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const bracket of brackets) {
    const upper = bracket.upTo == null ? income : Math.min(income, bracket.upTo);
    if (upper > lower) tax += (upper - lower) * bracket.rate;
    if (bracket.upTo == null || income <= bracket.upTo) break;
    lower = bracket.upTo;
  }
  return roundMoney(tax);
}

function grossIrpef(taxableIncome) {
  return progressiveTax(taxableIncome, CONFIG.irpef.brackets);
}

function employeeWorkDeduction(totalIncome) {
  if (totalIncome <= 0) return 0;
  const d = CONFIG.workDeduction;
  let deduction = 0;
  if (totalIncome <= d.first.upTo) {
    deduction = d.first.value;
  } else if (totalIncome <= d.second.upTo) {
    const ratio = truncate4((d.second.upTo - totalIncome) / d.second.denominator);
    deduction = d.second.base + (d.second.variable * ratio);
  } else if (totalIncome <= d.third.upTo) {
    const ratio = truncate4((d.third.upTo - totalIncome) / d.third.denominator);
    deduction = d.third.base * ratio;
  }
  if (totalIncome > d.extra65.minExclusive && totalIncome <= d.extra65.maxInclusive) {
    deduction += d.extra65.value;
  }
  return roundMoney(Math.max(0, deduction));
}

function additionalWorkDeduction(totalIncome) {
  const d = CONFIG.additionalWorkDeduction;
  if (totalIncome > d.full.minExclusive && totalIncome <= d.full.maxInclusive) return d.full.value;
  if (totalIncome > d.taper.minExclusive && totalIncome <= d.taper.maxInclusive) {
    return roundMoney(d.taper.value * ((d.taper.maxInclusive - totalIncome) / d.taper.denominator));
  }
  return 0;
}

function lowIncomeWedgeBonus(employmentIncome) {
  const b = CONFIG.lowIncomeWedgeBonus;
  if (employmentIncome <= 0 || employmentIncome > b.maxIncome) return 0;
  const band = b.bands.find(x => employmentIncome <= x.upTo);
  return band ? roundMoney(employmentIncome * band.rate) : 0;
}

function supplementaryTreatment(totalIncome, irpefGross, workDeduction) {
  const t = CONFIG.supplementaryTreatment;
  if (totalIncome <= 0 || totalIncome > t.maxIncome) return 0;
  const comparisonDeduction = Math.max(0, workDeduction - t.comparisonOffset);
  return irpefGross > comparisonDeduction ? t.value : 0;
}

function lombardyRegionalAdditional(taxableIncome, irpefDue) {
  if (irpefDue <= CONFIG.irpef.minimumDueForAdditionals || taxableIncome <= 0) return 0;
  return progressiveTax(taxableIncome, CONFIG.lombardyRegional.brackets);
}

function milanMunicipalAdditional(taxableIncome, irpefDue) {
  if (irpefDue <= CONFIG.irpef.minimumDueForAdditionals) return 0;
  if (taxableIncome <= CONFIG.milanMunicipal.exemption) return 0;

  // La soglia di 23.000 € è un'esenzione, non una franchigia:
  // superata la soglia, lo 0,8% si applica all'intero imponibile.
  return roundMoney(taxableIncome * CONFIG.milanMunicipal.rate);
}

function calculateSalary(grossAnnual, months) {
  const contributions = employeeContributions(grossAnnual);
  const taxable = roundMoney(Math.max(0, grossAnnual - contributions));

  const irpefGross = grossIrpef(taxable);
  const workDeduction = employeeWorkDeduction(taxable);
  const extraDeduction = additionalWorkDeduction(taxable);

  const irpefNet = roundMoney(Math.max(
    0,
    irpefGross - workDeduction - extraDeduction
  ));

  const regional = lombardyRegionalAdditional(taxable, irpefNet);
  const municipal = milanMunicipalAdditional(taxable, irpefNet);

  const wedgeBonus = lowIncomeWedgeBonus(taxable);
  const treatment = supplementaryTreatment(
    taxable,
    irpefGross,
    workDeduction
  );

  const taxes = roundMoney(irpefNet + regional + municipal);
  const netAnnual = roundMoney(
    grossAnnual - contributions - taxes + wedgeBonus + treatment
  );
  const netMonthlyAverage = roundMoney(netAnnual / months);

  return {
    grossAnnual,
    months,
    contributions,
    taxable,
    irpefGross,
    workDeduction,
    extraDeduction,
    irpefNet,
    regional,
    municipal,
    wedgeBonus,
    treatment,
    taxes,
    netAnnual,
    netMonthlyAverage
  };
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function toggleRow(id, amount) {
  document.getElementById(id).hidden = amount <= 0;
}


function percent(rate){ return (rate * 100).toLocaleString('it-IT', {maximumFractionDigits:2}) + '%'; }

function progressiveFormulaText(income, brackets, result) {
  let lower = 0;
  const parts = [];
  for (const bracket of brackets) {
    const upper = bracket.upTo == null ? income : Math.min(income, bracket.upTo);
    if (upper > lower) parts.push(`${euro.format(upper-lower)} × ${percent(bracket.rate)}`);
    if (bracket.upTo == null || income <= bracket.upTo) break;
    lower = bracket.upTo;
  }
  return `${parts.join(' + ')} = ${euro.format(result)}`;
}

function irpefFormulaText(taxable) {
  return progressiveFormulaText(taxable, CONFIG.irpef.brackets, grossIrpef(taxable));
}

function regionalFormulaText(result) {
  if (result.irpefNet <= CONFIG.irpef.minimumDueForAdditionals) {
    return 'IRPEF netta ' + euro.format(result.irpefNet) + ' ≤ ' +
      euro.format(CONFIG.irpef.minimumDueForAdditionals) + ': addizionale regionale non dovuta.';
  }
  return progressiveFormulaText(result.taxable, CONFIG.lombardyRegional.brackets, result.regional);
}

function bracketsLabel(brackets) {
  const parts=[];
  let lower=0;
  brackets.forEach((b,i)=>{
    if (b.upTo == null) parts.push(`${percent(b.rate)} oltre ${euro.format(lower)}`);
    else if (i===0) parts.push(`${percent(b.rate)} fino a ${euro.format(b.upTo)}`);
    else parts.push(`${percent(b.rate)} tra ${euro.format(lower)} e ${euro.format(b.upTo)}`);
    if (b.upTo != null) lower=b.upTo;
  });
  return parts.join(' · ');
}


function extra65Explanation(income) {
  const d = CONFIG.workDeduction.extra65;
  if (income <= d.minExclusive || income > d.maxInclusive) return '';
  return ' Supplemento di ' + euro.format(d.value) + ': ' + euro.format(d.minExclusive) +
    ' < reddito ' + euro.format(income) + ' ≤ ' + euro.format(d.maxInclusive) + '.';
}

function deductionsFormulaText(result) {
  const parts = [workDeductionFormulaText(result.taxable, result.workDeduction)];
  if (result.extraDeduction > 0) {
    parts.push(additionalDeductionFormulaText(result.taxable, result.extraDeduction));
  }
  const total = roundMoney(result.workDeduction + result.extraDeduction);
  if (total > result.irpefGross) {
    parts.push('Capienza IRPEF: detrazioni nominali ' + euro.format(total) +
      ', utilizzabili fino all’IRPEF lorda di ' + euro.format(result.irpefGross) +
      '. Eccedenza non rimborsabile: ' + euro.format(roundMoney(total - result.irpefGross)) +
      '. IRPEF netta = max(0, ' + euro.format(result.irpefGross) + ' − ' +
      euro.format(total) + ') = ' + euro.format(result.irpefNet) + '.');
  } else {
    parts.push('IRPEF netta: ' + euro.format(result.irpefGross) + ' − ' +
      euro.format(total) + ' = ' + euro.format(result.irpefNet) + '.');
  }
  return parts.join(' ');
}

function workDeductionFormulaText(income, value) {
  const d = CONFIG.workDeduction;
  if (income <= d.first.upTo) {
    return `Reddito fino a ${euro.format(d.first.upTo)} → detrazione ${euro.format(d.first.value)}.`;
  }
  if (income <= d.second.upTo) {
    const ratio = truncate4((d.second.upTo - income) / d.second.denominator);
    const baseValue = roundMoney(d.second.base + d.second.variable * ratio);
    const extra65 = income > d.extra65.minExclusive && income <= d.extra65.maxInclusive ? d.extra65.value : 0;
    return `Rapporto troncato a 4 decimali: (${euro.format(d.second.upTo)} − ${euro.format(income)}) / ${euro.format(d.second.denominator)} = ${ratio.toFixed(4).replace('.', ',')}. ` +
      `${euro.format(d.second.base)} + ${euro.format(d.second.variable)} × ${ratio.toFixed(4).replace('.', ',')}` +
      (extra65 ? ` + ${euro.format(extra65)}` : '') + ` = ${euro.format(value)}.` + extra65Explanation(income);
  }
  if (income <= d.third.upTo) {
    const ratio = truncate4((d.third.upTo - income) / d.third.denominator);
    const extra65 = income > d.extra65.minExclusive && income <= d.extra65.maxInclusive ? d.extra65.value : 0;
    return `Rapporto troncato a 4 decimali: (${euro.format(d.third.upTo)} − ${euro.format(income)}) / ${euro.format(d.third.denominator)} = ${ratio.toFixed(4).replace('.', ',')}. ` +
      `${euro.format(d.third.base)} × ${ratio.toFixed(4).replace('.', ',')}` +
      (extra65 ? ` + ${euro.format(extra65)}` : '') + ` = ${euro.format(value)}.` + extra65Explanation(income);
  }
  return `Oltre ${euro.format(d.third.upTo)}: detrazione ${euro.format(0)}.`;
}

function additionalDeductionFormulaText(income, value) {
  const d = CONFIG.additionalWorkDeduction;
  if (income > d.full.minExclusive && income <= d.full.maxInclusive) {
    return `Reddito nella fascia ${euro.format(d.full.minExclusive)}–${euro.format(d.full.maxInclusive)} → ulteriore detrazione ${euro.format(value)}.`;
  }
  if (income > d.taper.minExclusive && income <= d.taper.maxInclusive) {
    return `${euro.format(d.taper.value)} × (${euro.format(d.taper.maxInclusive)} − ${euro.format(income)}) / ${euro.format(d.taper.denominator)} = ${euro.format(value)}.`;
  }
  return `Nessuna ulteriore detrazione applicata.`;
}

function wedgeBonusFormulaText(income, value) {
  const b = CONFIG.lowIncomeWedgeBonus;
  const bandIndex = b.bands.findIndex(x => income <= x.upTo);
  if (bandIndex < 0 || value <= 0) return '';
  const band = b.bands[bandIndex];
  const lower = bandIndex > 0 ? b.bands[bandIndex - 1].upTo : 0;
  const condition = lower > 0
    ? euro.format(lower) + ' < reddito ' + euro.format(income) + ' ≤ ' + euro.format(band.upTo)
    : 'Reddito ' + euro.format(income) + ' ≤ ' + euro.format(band.upTo);
  return condition + ': ' + euro.format(income) + ' × ' + percent(band.rate) +
    ' = ' + euro.format(value) + '.';
}

function treatmentFormulaText(result) {
  if (result.treatment <= 0) return '';
  const t = CONFIG.supplementaryTreatment;
  const comparison = Math.max(0, result.workDeduction - t.comparisonOffset);
  return 'Reddito ' + euro.format(result.taxable) + ' ≤ ' + euro.format(t.maxIncome) +
    '; IRPEF lorda ' + euro.format(result.irpefGross) + ' > detrazione lavoro ' +
    euro.format(result.workDeduction) + ' − ' + euro.format(t.comparisonOffset) +
    ' = ' + euro.format(comparison) + '. Per l’intero anno: trattamento integrativo ' +
    euro.format(result.treatment) + '.';
}

function render(result) {
  setText('net-annual', euro.format(result.netAnnual));
  setText('net-monthly', euro.format(result.netMonthlyAverage));
  setText(
    'months-caption',
    `Ripartizione matematica su ${result.months} mensilità.`
  );
  setText('contributions-total', euro.format(result.contributions));
  setText('taxes-total', euro.format(result.taxes));

  setText('b-gross', euro.format(result.grossAnnual));
  setText('b-contrib', euro.format(result.contributions));
  setText('b-taxable', euro.format(result.taxable));
  setText('b-irpef-gross', euro.format(result.irpefGross));
  setText('b-work-deduction', euro.format(result.workDeduction));
  setText('b-extra-deduction', euro.format(result.extraDeduction));
  setText('b-irpef-net', euro.format(result.irpefNet));
  setText('b-regional', euro.format(result.regional));
  setText('b-municipal', euro.format(result.municipal));
  setText('b-wedge-bonus', euro.format(result.wedgeBonus));
  setText('b-treatment', euro.format(result.treatment));
  setText('b-net', euro.format(result.netAnnual));

  toggleRow('extra-deduction-row', result.extraDeduction);
  toggleRow('wedge-bonus-row', result.wedgeBonus);
  toggleRow('treatment-row', result.treatment);

  const c13 = calculateSalary(result.grossAnnual, 13);
  const c14 = calculateSalary(result.grossAnnual, 14);
  setText('compare-13', euro.format(c13.netMonthlyAverage));
  setText('compare-14', euro.format(c14.netMonthlyAverage));

  setText('a-contrib', euro.format(result.contributions));
  setText('a-taxable', euro.format(result.taxable));
  setText('a-irpef-gross', euro.format(result.irpefGross));
  setText('a-deductions', euro.format(result.workDeduction + result.extraDeduction));
  setText('a-wedge-bonus', euro.format(result.wedgeBonus));
  setText('a-treatment', euro.format(result.treatment));
  document.getElementById('audit-wedge-bonus').hidden = result.wedgeBonus <= 0;
  document.getElementById('audit-treatment').hidden = result.treatment <= 0;
  setText('a-regional', euro.format(result.regional));
  setText('a-municipal', euro.format(result.municipal));

  setText('formula-contrib', `${euro.format(result.grossAnnual)} × ${percent(CONFIG.employeeContributions.standardRate)} = ${euro.format(result.contributions)}`);
  setText('formula-taxable', `${euro.format(result.grossAnnual)} − ${euro.format(result.contributions)} = ${euro.format(result.taxable)}`);
  setText('formula-irpef', irpefFormulaText(result.taxable));
  setText('formula-deductions', deductionsFormulaText(result));
  setText('formula-wedge-bonus', wedgeBonusFormulaText(result.taxable, result.wedgeBonus));
  setText('formula-treatment', treatmentFormulaText(result));
  setText('formula-regional', regionalFormulaText(result));
  setText('formula-municipal', result.municipal > 0
    ? `${euro.format(result.taxable)} × ${percent(CONFIG.milanMunicipal.rate)} = ${euro.format(result.municipal)}`
    : result.irpefNet <= CONFIG.irpef.minimumDueForAdditionals
      ? 'IRPEF netta ' + euro.format(result.irpefNet) + ' ≤ ' + euro.format(CONFIG.irpef.minimumDueForAdditionals) +
        ': addizionale comunale non dovuta.'
      : 'Imponibile ' + euro.format(result.taxable) + ' ≤ esenzione Milano ' +
        euro.format(CONFIG.milanMunicipal.exemption) + ': addizionale comunale ' + euro.format(0) + '.');



  const benefits = roundMoney(result.wedgeBonus + result.treatment);
  const baseNet = roundMoney(result.grossAnnual - result.contributions - result.taxes);
  const netPct = Math.max(0, (baseNet / result.grossAnnual) * 100);
  const contribPct = Math.max(0, (result.contributions / result.grossAnnual) * 100);
  const taxPct = Math.max(0, (result.taxes / result.grossAnnual) * 100);
  document.getElementById('flow-net').style.width = `${netPct}%`;
  document.getElementById('flow-contrib').style.width = `${contribPct}%`;
  document.getElementById('flow-tax').style.width = `${taxPct}%`;
  setText('flow-net-label', `${netPct.toFixed(1).replace('.', ',')}%`);
  setText('flow-contrib-label', `${contribPct.toFixed(1).replace('.', ',')}%`);
  setText('flow-tax-label', `${taxPct.toFixed(1).replace('.', ',')}%`);
  setText('flow-effective-rate', `Trattenute ${((result.contributions + result.taxes)/result.grossAnnual*100).toFixed(1).replace('.', ',')}%`);
  const benefitBox = document.getElementById('flow-benefits');
  benefitBox.hidden = benefits <= 0;
  if (benefits > 0) {
    setText('flow-net-name', 'Netto dalla RAL');
    setText('flow-benefits-value', euro.format(benefits));
    setText('flow-benefits-final', euro.format(result.netAnnual));
  } else {
    setText('flow-net-name', 'Netto');
  }

  setText('ruleset-status', `Ruleset approvato: ${new Date(CONFIG.meta.approvedAt + 'T00:00:00').toLocaleDateString('it-IT')}`);
  setText('ruleset-id', `Ruleset ${CONFIG.meta.rulesetId} · aggiornamenti automatici disabilitati: le variazioni richiedono revisione.`);
  setText('contrib-rule-text', `profilo standard ${percent(CONFIG.employeeContributions.standardRate)}.`);
  setText('irpef-rule-text', bracketsLabel(CONFIG.irpef.brackets));
  setText('milan-rule-text', `Aliquota ${percent(CONFIG.milanMunicipal.rate)}; esenzione fino a ${euro.format(CONFIG.milanMunicipal.exemption)} di imponibile${CONFIG.milanMunicipal.exemptionIsFranchise ? '.' : ', che non costituisce franchigia.'}`);

  renderSensitiveThreshold(result);

  document.getElementById('results').hidden = false;
}

function validateGross(value) {
  if (!Number.isFinite(value)) return 'Inserisci una Retribuzione Annua Lorda valida.';
  if (value < CONFIG.input.minGross) return `Per questa versione inserisci almeno ${euro.format(CONFIG.input.minGross)}.`;
  if (value > CONFIG.input.maxGross) return `Per questa versione il limite è ${euro.format(CONFIG.input.maxGross)}.`;
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) return 'Usa al massimo due cifre decimali.';
  return '';
}

if (typeof window !== 'undefined') {
  window.__SALARY_ENGINE__ = {
    calculateSalary,
    validateGross,
    employeeContributions,
    employeeWorkDeduction,
    firstGrossAboveTaxableThreshold,
    roundMoney,
    truncate4
  };
}

let lastResult = null;

document.getElementById('salary-form').addEventListener('submit', (event) => {
  event.preventDefault();

  const gross = Number(document.getElementById('ral').value);
  const months = Number(
    document.querySelector('input[name="months"]:checked').value
  );
  const error = validateGross(gross);
  const errorBox = document.getElementById('form-error');

  if (error) {
    errorBox.textContent = error;
    errorBox.hidden = false;
    document.getElementById('results').hidden = true;
    return;
  }

  errorBox.hidden = true;
  const result = calculateSalary(gross, months);
  lastResult = result;
  render(result);

  document.getElementById('results').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
});

// Mostra un esempio già funzionante al primo caricamento.
// L'utente può cambiare i valori e ricalcolare.
document.getElementById('ral').min = CONFIG.input.minGross;
document.getElementById('ral').max = CONFIG.input.maxGross;
setText('ral-help', `Per questa versione: da ${euro.format(CONFIG.input.minGross)} a ${euro.format(CONFIG.input.maxGross)}.`);
lastResult = calculateSalary(30000, 13);
render(lastResult);

document.getElementById('edit-data').addEventListener('click', () => {
  document.querySelector('.calculator-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => document.getElementById('ral').focus(), 300);
});

document.getElementById('copy-summary').addEventListener('click', async () => {
  if (!lastResult) return;
  const text = [
    'Simulazione stipendio netto 2026',
    `Retribuzione Annua Lorda: ${euro.format(lastResult.grossAnnual)}`,
    'Profilo: settore privato · tempo indeterminato · Milano · 2026',
    `Mensilità selezionate: ${lastResult.months}`,
    `Netto annuo stimato: ${euro.format(lastResult.netAnnual)}`,
    `Netto medio per mensilità: ${euro.format(lastResult.netMonthlyAverage)}`,
    `Contributi stimati: ${euro.format(lastResult.contributions)}`,
    `Imposte stimate: ${euro.format(lastResult.taxes)}`,
    `Ruleset approvato: ${new Date(CONFIG.meta.approvedAt + 'T00:00:00').toLocaleDateString('it-IT')}`,
    `ID ruleset: ${CONFIG.meta.rulesetId}`,
    'Nota: stima annuale, non ricostruzione del singolo cedolino.'
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    const msg=document.getElementById('copy-feedback'); msg.hidden=false;
    setTimeout(()=>{msg.hidden=true},1800);
  } catch(e) {
    window.prompt('Copia il riepilogo:', text);
  }
});


document.getElementById('try-threshold').addEventListener('click', () => {
  const thresholdGross = firstGrossAboveTaxableThreshold(CONFIG.milanMunicipal.exemption);
  const grossInput = document.getElementById('ral');
  grossInput.value = thresholdGross.toFixed(2);

  const months = Number(
    document.querySelector('input[name="months"]:checked').value
  );

  lastResult = calculateSalary(thresholdGross, months);
  render(lastResult);

  document.getElementById('threshold-panel').scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });
});
