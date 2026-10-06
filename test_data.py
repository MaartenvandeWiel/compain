"""Poort voor publicatie: data/sultan.json moet kloppen en mag alleen totalen bevatten.
Ook het prognosemodel (prognose.js) wordt hier gecontroleerd, via Node.

Draaien: python -m pytest test_data.py -v   (eerst python maak_data.py)
De /compainSaveGithub-skill publiceert niet als hier iets faalt.
"""
import json
import re
import shutil
import subprocess
from decimal import Decimal
from pathlib import Path

import pytest

HIER = Path(__file__).parent
JSON = HIER / "data" / "sultan.json"

# Uit het blad Controles van ingredienten/sultan-orders.xlsx (dataset met vaste seed, verandert niet).
CONTROLES = {
    "2021": {"omzet": "519800.87", "orders": 25880, "gem_bon": "20.09", "netto": "479931.81"},
    "2022": {"omzet": "610496.56", "orders": 30440, "gem_bon": "20.06", "netto": "563705.48"},
    "2023": {"omzet": "672196.02", "orders": 30177, "gem_bon": "22.28", "netto": "623243.25"},
    "2024": {"omzet": "715372.59", "orders": 30844, "gem_bon": "23.19", "netto": "665489.84"},
    "2025": {"omzet": "744877.60", "orders": 31232, "gem_bon": "23.85", "netto": "694934.08"},
}
TOTAAL_OMZET = Decimal("3262743.64")

# Sleutels en patronen die nooit in de publieke data mogen staan.
VERBODEN_SLEUTELS = {"order_id", "ordernummer", "klant_id", "medewerker_id", "bezorger_id",
                     "uurloon", "uurloon_euro", "postcode", "telefoon", "nummer", "nummer_gemaskeerd"}
VERBODEN_PATRONEN = [r"\bO\d{7}\b", r"\bKL\d{6}\b", r"\bMW\d{3}\b", r"\b06[\d*]{8}\b", r"@"]


@pytest.fixture(scope="module")
def data():
    if not JSON.exists():
        pytest.fail("data/sultan.json ontbreekt, draai eerst: python maak_data.py")
    return json.loads(JSON.read_text(encoding="utf-8"))


def d(waarde):
    return Decimal(str(waarde)).quantize(Decimal("0.01"))


@pytest.mark.parametrize("jaar", CONTROLES)
def test_kerngetallen_gelijk_aan_controles(data, jaar):
    kg = data["per_jaar"][jaar]["kerngetallen"]
    verwacht = CONTROLES[jaar]
    assert d(kg["omzet"]) == Decimal(verwacht["omzet"])
    assert kg["orders"] == verwacht["orders"]
    assert d(kg["gem_bon"]) == Decimal(verwacht["gem_bon"])
    assert d(kg["netto"]) == Decimal(verwacht["netto"])


@pytest.mark.parametrize("jaar", CONTROLES)
def test_maand_en_weekdag_tellen_op_tot_jaaromzet(data, jaar):
    blok = data["per_jaar"][jaar]
    omzet = Decimal(CONTROLES[jaar]["omzet"])
    assert len(blok["maand"]) == 12 and len(blok["weekdag"]) == 7
    assert sum(d(m) for m in blok["maand"]) == omzet
    assert sum(d(w) for w in blok["weekdag"]) == omzet


def test_alle_jaren_klopt(data):
    alle = data["alle"]
    assert d(alle["kerngetallen"]["omzet"]) == TOTAAL_OMZET
    assert sum(d(m["omzet"]) for m in alle["maand"]) == TOTAAL_OMZET
    assert sum(d(w) for w in alle["weekdag"]) == TOTAAL_OMZET


def test_toplijsten(data):
    for blok in [*data["per_jaar"].values(), data["alle"]]:
        assert len(blok["top_gerechten"]) == 10 and len(blok["top_dranken"]) == 3
        assert all(g["categorie"] not in ("Dranken", "Sauzen") for g in blok["top_gerechten"])
        assert all(g["categorie"] == "Dranken" for g in blok["top_dranken"])


@pytest.mark.parametrize("jaar", CONTROLES)
def test_kanalen_tellen_op_tot_jaartotalen(data, jaar):
    kg = data["per_jaar"][jaar]["kerngetallen"]
    kanalen = data["per_jaar"][jaar]["kanalen"]
    assert sum(k["orders"] for k in kanalen) == kg["orders"]
    assert sum(d(k["omzet"]) for k in kanalen) == d(kg["omzet"])
    assert sum(d(k["commissie"]) for k in kanalen) == d(kg["omzet"]) - d(kg["netto"])


def test_prognose_bouwstenen(data):
    p = data["prognose"]
    assert p["basisjaar"] == data["jaren"][-1] and p["prognosejaar"] == p["basisjaar"] + 1
    assert p["kanalen"] == data["per_jaar"][str(p["basisjaar"])]["kanalen"]
    assert len(p["seizoen"]) == 12 and abs(sum(p["seizoen"]) - 1) < 1e-5
    g = p["groei"]
    assert g["laag"] <= g["basis"] <= g["hoog"]


def node_bereken(instellingen):
    """Draait prognose.js in Node, precies zoals de browser hem gebruikt."""
    node = shutil.which("node")
    if not node:
        pytest.fail("node ontbreekt, nodig om prognose.js te controleren")
    script = ("const P = require('./prognose.js'); const d = require('./data/sultan.json');"
              f"console.log(JSON.stringify(P.bereken(d.prognose, {json.dumps(instellingen)})));")
    uit = subprocess.run([node, "-e", script], cwd=HIER, capture_output=True, text=True, check=True)
    return json.loads(uit.stdout)


def test_prognose_zonder_groei_is_basisjaar(data):
    kg = data["per_jaar"][str(data["prognose"]["basisjaar"])]["kerngetallen"]
    p = node_bereken({"groei": 0, "prijs": 0})
    assert abs(p["omzet"] - kg["omzet"]) < 0.01
    assert abs(p["orders"] - kg["orders"]) < 1e-6
    assert abs(p["netto"] - kg["netto"]) < 0.01
    assert abs(sum(p["maand"]) - p["omzet"]) < 0.01


def test_prognose_groei_en_prijs_werken_door(data):
    kg = data["per_jaar"][str(data["prognose"]["basisjaar"])]["kerngetallen"]
    g = data["prognose"]["groei"]["basis"]
    basis = node_bereken({})
    assert abs(basis["omzet"] - kg["omzet"] * (1 + g)) < 0.01
    assert abs(basis["orders"] - kg["orders"] * (1 + g)) < 1e-6
    duurder = node_bereken({"prijs": 0.05})
    assert abs(duurder["omzet"] - basis["omzet"] * 1.05) < 0.01
    assert abs(duurder["orders"] - basis["orders"]) < 1e-6


def test_alleen_totalen_geen_persoons_of_ordergegevens(data):
    def sleutels(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                yield k
                yield from sleutels(v)
        elif isinstance(obj, list):
            for v in obj:
                yield from sleutels(v)

    gevonden = VERBODEN_SLEUTELS & set(sleutels(data))
    assert not gevonden, f"verboden velden in de publieke data: {gevonden}"
    tekst = JSON.read_text(encoding="utf-8")
    for patroon in VERBODEN_PATRONEN:
        assert not re.search(patroon, tekst), f"patroon {patroon} gevonden in de publieke data"
    # Totalen zijn klein. Een dik bestand wijst op ruwe data.
    assert JSON.stat().st_size < 100_000
