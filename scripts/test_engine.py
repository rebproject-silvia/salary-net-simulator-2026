#!/usr/bin/env python3
"""V0.9 Decimal oracle, compared against the actual JavaScript (not a replacement frontend)."""
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP, ROUND_DOWN
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
R = json.loads((ROOT / "data/rules-2026.json").read_text(encoding="utf-8"),
               parse_float=Decimal, parse_int=Decimal)
ZERO = Decimal("0")
CENT = Decimal("0.01")


def D(value):
    if isinstance(value, float):
        raise TypeError("Pass decimal text, integers or Decimal; never a precomputed float")
    return value if isinstance(value, Decimal) else Decimal(value)


def money(value):
    return D(value).quantize(CENT, rounding=ROUND_HALF_UP)


def trunc4(value):
    return D(value).quantize(Decimal("0.0001"), rounding=ROUND_DOWN)


def progressive(income, brackets):
    tax = lower = ZERO
    for bracket in brackets:
        upper = income if bracket["upTo"] is None else min(income, bracket["upTo"])
        if upper > lower:
            tax += (upper - lower) * bracket["rate"]
        if bracket["upTo"] is None or income <= bracket["upTo"]:
            break
        lower = bracket["upTo"]
    return money(tax)


def contrib(gross):
    return money(D(gross) * R["employeeContributions"]["standardRate"])


def work_deduction(income):
    if income <= ZERO:
        return ZERO
    d = R["workDeduction"]
    value = ZERO
    if income <= d["first"]["upTo"]:
        value = d["first"]["value"]
    elif income <= d["second"]["upTo"]:
        ratio = trunc4((d["second"]["upTo"] - income) / d["second"]["denominator"])
        value = d["second"]["base"] + d["second"]["variable"] * ratio
    elif income <= d["third"]["upTo"]:
        ratio = trunc4((d["third"]["upTo"] - income) / d["third"]["denominator"])
        value = d["third"]["base"] * ratio
    if d["extra65"]["minExclusive"] < income <= d["extra65"]["maxInclusive"]:
        value += d["extra65"]["value"]
    return money(max(ZERO, value))


def extra_ded(income):
    d = R["additionalWorkDeduction"]
    if d["full"]["minExclusive"] < income <= d["full"]["maxInclusive"]:
        return money(d["full"]["value"])
    if d["taper"]["minExclusive"] < income <= d["taper"]["maxInclusive"]:
        return money(d["taper"]["value"] *
                     ((d["taper"]["maxInclusive"] - income) / d["taper"]["denominator"]))
    return ZERO


def wedge(income):
    b = R["lowIncomeWedgeBonus"]
    if income <= ZERO or income > b["maxIncome"]:
        return ZERO
    band = next((item for item in b["bands"] if income <= item["upTo"]), None)
    return money(income * band["rate"]) if band else ZERO


def treatment(income, irpef_gross, deduction):
    t = R["supplementaryTreatment"]
    if income <= ZERO or income > t["maxIncome"]:
        return ZERO
    return t["value"] if irpef_gross > max(ZERO, deduction - t["comparisonOffset"]) else ZERO


def calc(gross, months=13):
    gross = D(gross)
    contributions = contrib(gross)
    taxable = money(max(ZERO, gross - contributions))
    irpef_gross = progressive(taxable, R["irpef"]["brackets"])
    deduction = work_deduction(taxable)
    extra = extra_ded(taxable)
    irpef_net = money(max(ZERO, irpef_gross - deduction - extra))
    if irpef_net > R["irpef"]["minimumDueForAdditionals"]:
        regional = progressive(taxable, R["lombardyRegional"]["brackets"])
        municipal = (money(taxable * R["milanMunicipal"]["rate"])
                     if taxable > R["milanMunicipal"]["exemption"] else ZERO)
    else:
        regional = municipal = ZERO
    bonus = wedge(taxable)
    supplement = treatment(taxable, irpef_gross, deduction)
    taxes = money(irpef_net + regional + municipal)
    net = money(gross - contributions - taxes + bonus + supplement)
    return dict(grossAnnual=gross, months=D(months), contributions=contributions,
                taxable=taxable, irpefGross=irpef_gross, workDeduction=deduction,
                extraDeduction=extra, irpefNet=irpef_net, regional=regional, municipal=municipal,
                wedgeBonus=bonus, treatment=supplement, taxes=taxes,
                netAnnual=net, netMonthlyAverage=money(net / D(months)))


def first_gross_where(predicate):
    low, high = int(R["input"]["minGross"] * 100), int(R["input"]["maxGross"] * 100)
    while low < high:
        mid = (low + high) // 2
        if predicate(calc(Decimal(mid) / 100)):
            high = mid
        else:
            low = mid + 1
    return Decimal(low) / 100


def first_above(target):
    target = D(target)
    return first_gross_where(lambda result: result["taxable"] > target)


def regression_grosses(full_euros=False):
    values = {D(g) for g in range(5000, 50001, 1 if full_euros else 100)}
    values.update(D(g) for g in ["5049", "5450", "16524", "25327.61", "25327.62", "30000.01"])
    boundaries = [first_above(value) for value in
                  ["8500", "15000", "20000", "23000", "25000", "28000", "32000", "35000", "40000"]]
    boundaries += [
        first_gross_where(lambda result: result["irpefNet"] > R["irpef"]["minimumDueForAdditionals"]),
        first_gross_where(lambda result: result["irpefGross"] >
                          result["workDeduction"] - R["supplementaryTreatment"]["comparisonOffset"])
    ]
    for boundary in boundaries:
        values.update(boundary + CENT * offset for offset in [-2, -1, 0, 1, 2])
    return sorted(g for g in values if R["input"]["minGross"] <= g <= R["input"]["maxGross"])


def main():
    assert money("500.855") == D("500.86")
    assert contrib(5450) == D("500.86")
    assert calc(5049)["wedgeBonus"] == D("325.54")
    assert calc(5049)["netAnnual"] == D("4910.54")
    assert calc(30000)["workDeduction"] == D("2044.26")
    assert calc(30000)["netAnnual"] == D("23425.49")
    assert calc(30000, 14)["netMonthlyAverage"] == D("1673.25")
    threshold = first_above(23000)
    assert threshold == D("25327.62")
    before, after = calc(threshold - CENT), calc(threshold)
    assert before["municipal"] == ZERO and after["municipal"] == D("184.00")
    assert after["netAnnual"] - before["netAnnual"] == D("-183.99")
    grosses = regression_grosses("--full-euros" in sys.argv)
    cases = [dict(gross=str(gross), months=months) for gross in grosses for months in (13, 14)]
    completed = subprocess.run(
        ["node", str(ROOT / "scripts/test_app_js.cjs"), "--cases"],
        input=json.dumps(cases), capture_output=True, text=True, encoding="utf-8", check=True,
        timeout=120
    )
    actual = json.loads(completed.stdout, parse_float=Decimal, parse_int=Decimal)
    assert len(actual) == len(cases)
    for case, observed in zip(cases, actual):
        expected = calc(case["gross"], case["months"])
        assert observed.keys() == expected.keys(), (case, "missing/unexpected result fields")
        for field, value in expected.items():
            assert isinstance(value, Decimal) and value.is_finite(), (case, field, value)
            assert isinstance(observed[field], Decimal) and observed[field].is_finite()
            assert observed[field] == value, (case, field, observed[field], value)
    for gross in grosses:
        a, b = calc(gross, 13), calc(gross, 14)
        for field in a.keys() - {"months", "netMonthlyAverage"}:
            assert a[field] == b[field], (gross, field)
    print(f"PASS - Decimal oracle and actual JavaScript: {len(grosses)} RAL, {len(cases)} cases, all fields")
    print(f"5049: bonus {calc(5049)['wedgeBonus']:.2f}; net {calc(5049)['netAnnual']:.2f}")
    print(f"Milan: {threshold-CENT:.2f} / {threshold:.2f}; net {before['netAnnual']:.2f} / {after['netAnnual']:.2f}")


if __name__ == "__main__":
    main()
