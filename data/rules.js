window.TAX_RULES = {
  "meta": {
    "rulesetId": "IT-MI-2026.08-b78ba29f",
    "year": 2026,
    "approvedAt": "2026-08-31",
    "status": "approved",
    "scope": "Dipendente privato, tempo indeterminato, Milano, unico reddito da lavoro dipendente"
  },
  "input": {
    "minGross": 5000,
    "maxGross": 50000,
    "nearThresholdWindow": 500
  },
  "employeeContributions": {
    "standardRate": 0.0919
  },
  "irpef": {
    "brackets": [
      {
        "upTo": 28000,
        "rate": 0.23
      },
      {
        "upTo": 50000,
        "rate": 0.33
      },
      {
        "upTo": null,
        "rate": 0.43
      }
    ],
    "minimumDueForAdditionals": 10.33
  },
  "workDeduction": {
    "first": {
      "upTo": 15000,
      "value": 1955
    },
    "second": {
      "upTo": 28000,
      "base": 1910,
      "variable": 1190,
      "denominator": 13000
    },
    "third": {
      "upTo": 50000,
      "base": 1910,
      "denominator": 22000
    },
    "extra65": {
      "minExclusive": 25000,
      "maxInclusive": 35000,
      "value": 65
    }
  },
  "additionalWorkDeduction": {
    "full": {
      "minExclusive": 20000,
      "maxInclusive": 32000,
      "value": 1000
    },
    "taper": {
      "minExclusive": 32000,
      "maxInclusive": 40000,
      "value": 1000,
      "denominator": 8000
    }
  },
  "lowIncomeWedgeBonus": {
    "maxIncome": 20000,
    "bands": [
      {
        "upTo": 8500,
        "rate": 0.071
      },
      {
        "upTo": 15000,
        "rate": 0.053
      },
      {
        "upTo": 20000,
        "rate": 0.048
      }
    ]
  },
  "supplementaryTreatment": {
    "maxIncome": 15000,
    "comparisonOffset": 75,
    "value": 1200
  },
  "lombardyRegional": {
    "brackets": [
      {
        "upTo": 15000,
        "rate": 0.0123
      },
      {
        "upTo": 28000,
        "rate": 0.0158
      },
      {
        "upTo": 50000,
        "rate": 0.0172
      },
      {
        "upTo": null,
        "rate": 0.0173
      }
    ]
  },
  "milanMunicipal": {
    "rate": 0.008,
    "exemption": 23000,
    "exemptionIsFranchise": false
  },
  "sources": {
    "irpef": {
      "label": "Camera dei Deputati",
      "url": "https://temi.camera.it/leg19/temi/19_tl18_irpef",
      "mode": "review-only"
    },
    "inps": {
      "label": "INPS",
      "url": "https://www.inps.it/it/it/inps-comunica/atti/circolari-messaggi-e-normativa/dettaglio.circolari-e-messaggi.2026.01.circolare-numero-6-del-30-01-2026_15151.html",
      "mode": "review-only"
    },
    "lombardy": {
      "label": "Regione Lombardia",
      "url": "https://www.regione.lombardia.it/bollo-auto-e-tributi-regionali/red-addizionale-regionale-irpef",
      "mode": "review-only"
    },
    "milan": {
      "label": "Comune di Milano",
      "url": "https://www.comune.milano.it/argomenti/tributi/addizionale-comunale-irpef",
      "mode": "review-only"
    },
    "employeeTax": {
      "label": "Agenzia delle Entrate",
      "url": "https://infoprecompilata.agenziaentrate.gov.it/portale/semplificata-mod-lavoro-dipendente-e-pensioni",
      "mode": "review-only"
    }
  }
};
