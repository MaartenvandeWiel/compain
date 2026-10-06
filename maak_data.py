"""Rekent de totalen voor het Sultan-dashboard uit en schrijft ze naar data/sultan.json.

Leest sultan-db/sultan.duckdb alleen-lezen. Er gaan ALLEEN totalen naar buiten: geen order-, klant- of
medewerkergegevens. Deze map wordt publiek gemaakt, dus wat hier in de JSON komt, kan iedereen zien.

Definities (zie ../CLAUDE.md): omzet = som van totaal_incl_btw over orders met status 'voltooid',
jaar, maand en weekdag gaan op bedrijfsdag.
Gebruik: python maak_data.py   (eerst python laad_database.py in ../sultan-db)
"""
import calendar
import json
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

import duckdb

HIER = Path(__file__).parent
DB = HIER.parent / "sultan-db" / "sultan.duckdb"
UIT = HIER / "data" / "sultan.json"

WEEKDAGEN = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"]
GEEN_GERECHT = ("Dranken", "Sauzen")
KANAAL_VOLGORDE = ["dine-in", "afhaal", "eigen bezorging", "Thuisbezorgd", "Uber Eats", "Deliveroo"]
# Seizoen en ordergroei voor de prognose: alleen jaren na de lockdowns van 2021 en begin 2022.
EERSTE_NORMALE_JAAR = 2023


def euro(waarde):
    """Decimal naar een JSON-getal met precies twee decimalen."""
    return float(Decimal(waarde or 0).quantize(Decimal("0.01")))


def kerngetallen(con, filter_sql):
    omzet, orders, commissie = con.execute(f"""
        SELECT sum(totaal_incl_btw), count(*), sum(platform_commissie)
        FROM orders WHERE status = 'voltooid' AND {filter_sql}
    """).fetchone()
    return {
        "omzet": euro(omzet),
        "orders": orders,
        "gem_bon": euro(omzet / orders),
        "netto": euro(omzet - commissie),
    }


def omzet_per_weekdag(con, filter_sql):
    rijen = dict(con.execute(f"""
        SELECT isodow(bedrijfsdag), sum(totaal_incl_btw)
        FROM orders WHERE status = 'voltooid' AND {filter_sql}
        GROUP BY 1
    """).fetchall())
    return [euro(rijen.get(i + 1)) for i in range(7)]


def kanalen(con, filter_sql):
    rijen = con.execute(f"""
        SELECT kanaal, count(*), sum(totaal_incl_btw), sum(platform_commissie)
        FROM orders WHERE status = 'voltooid' AND {filter_sql}
        GROUP BY 1
    """).fetchall()
    rijen.sort(key=lambda r: KANAAL_VOLGORDE.index(r[0]) if r[0] in KANAAL_VOLGORDE else len(KANAAL_VOLGORDE))
    return [{"kanaal": k, "orders": n, "omzet": euro(o), "commissie": euro(c)} for k, n, o, c in rijen]


def per_maand(con, jaar):
    """Twaalf maandblokken: kerngetallen, weekdag, kanalen en omzet per dag. Dagen zonder omzet (dicht) staan op 0."""
    filt = f"status = 'voltooid' AND year(bedrijfsdag) = {jaar}"
    kern = {m: (o, n, c) for m, o, n, c in con.execute(f"""
        SELECT month(bedrijfsdag), sum(totaal_incl_btw), count(*), sum(platform_commissie)
        FROM orders WHERE {filt} GROUP BY 1
    """).fetchall()}
    weekdag = {(m, d): o for m, d, o in con.execute(f"""
        SELECT month(bedrijfsdag), isodow(bedrijfsdag), sum(totaal_incl_btw)
        FROM orders WHERE {filt} GROUP BY 1, 2
    """).fetchall()}
    kanaalrijen = con.execute(f"""
        SELECT month(bedrijfsdag), kanaal, count(*), sum(totaal_incl_btw), sum(platform_commissie)
        FROM orders WHERE {filt} GROUP BY 1, 2
    """).fetchall()
    dagen = {(m, d): o for m, d, o in con.execute(f"""
        SELECT month(bedrijfsdag), day(bedrijfsdag), sum(totaal_incl_btw)
        FROM orders WHERE {filt} GROUP BY 1, 2
    """).fetchall()}

    maanden = []
    for m in range(1, 13):
        omzet, orders, commissie = kern.get(m, (0, 0, 0))
        rijen = sorted((r for r in kanaalrijen if r[0] == m),
                       key=lambda r: KANAAL_VOLGORDE.index(r[1]) if r[1] in KANAAL_VOLGORDE else len(KANAAL_VOLGORDE))
        aantal_dagen = calendar.monthrange(jaar, m)[1]
        maanden.append({
            "kerngetallen": {
                "omzet": euro(omzet),
                "orders": orders,
                "gem_bon": euro(omzet / orders) if orders else 0.0,
                "netto": euro(omzet - commissie),
            },
            "weekdag": [euro(weekdag.get((m, d))) for d in range(1, 8)],
            "kanalen": [{"kanaal": k, "orders": n, "omzet": euro(o), "commissie": euro(c)} for _, k, n, o, c in rijen],
            "dagen": [euro(dagen.get((m, d))) for d in range(1, aantal_dagen + 1)],
        })
    return maanden


def top_artikelen(con, jaar_filter, gerechten, aantal):
    categorie_sql = "NOT IN" if gerechten else "IN"
    lijst = ", ".join(f"'{c}'" for c in (GEEN_GERECHT if gerechten else ("Dranken",)))
    rijen = con.execute(f"""
        SELECT artikelnaam, categorie, sum(aantal_verkocht), sum(omzet_incl_btw)
        FROM artikelomzet
        WHERE categorie {categorie_sql} ({lijst}) AND {jaar_filter}
        GROUP BY 1, 2
        ORDER BY 4 DESC, 1
        LIMIT {aantal}
    """).fetchall()
    return [{"naam": n, "categorie": c, "aantal": int(a), "omzet": euro(o)} for n, c, a, o in rijen]


def per_jaar(con, jaar):
    filt = f"year(bedrijfsdag) = {jaar}"
    maanden = dict(con.execute(f"""
        SELECT month(bedrijfsdag), sum(totaal_incl_btw)
        FROM orders WHERE status = 'voltooid' AND {filt}
        GROUP BY 1
    """).fetchall())
    return {
        "kerngetallen": kerngetallen(con, filt),
        "maand": [euro(maanden.get(m)) for m in range(1, 13)],
        "weekdag": omzet_per_weekdag(con, filt),
        "kanalen": kanalen(con, filt),
        "maanden": per_maand(con, jaar),
        "top_gerechten": top_artikelen(con, f"jaar = {jaar}", gerechten=True, aantal=10),
        "top_dranken": top_artikelen(con, f"jaar = {jaar}", gerechten=False, aantal=3),
    }


def alle_jaren(con):
    maanden = con.execute("""
        SELECT strftime(bedrijfsdag, '%Y-%m'), sum(totaal_incl_btw)
        FROM orders WHERE status = 'voltooid'
        GROUP BY 1 ORDER BY 1
    """).fetchall()
    return {
        "kerngetallen": kerngetallen(con, "true"),
        "maand": [{"periode": p, "omzet": euro(o)} for p, o in maanden],
        "weekdag": omzet_per_weekdag(con, "true"),
        "kanalen": kanalen(con, "true"),
        "top_gerechten": top_artikelen(con, "true", gerechten=True, aantal=10),
        "top_dranken": top_artikelen(con, "true", gerechten=False, aantal=3),
    }


def prognose_basis(jaren, per_jaar_data):
    """Bouwstenen voor de prognose. Het rekenen zelf gebeurt in prognose.js, zodat hefbomen er later op kunnen inhaken.

    - kanalen: orders, omzet en commissie van het laatste jaar, het vertrekpunt
    - seizoen: aandeel van elke maand in de jaaromzet, gemiddeld over de normale jaren
    - groei: jaarlijkse ordergroei. Basis = gemiddelde groei per jaar sinds het laatste lockdownjaar,
      laag en hoog = het slechtste en beste losse jaar
    """
    basisjaar = jaren[-1]
    normaal = [j for j in jaren if j >= EERSTE_NORMALE_JAAR]
    orders = {j: per_jaar_data[str(j)]["kerngetallen"]["orders"] for j in jaren}
    groei_per_jaar = [orders[j] / orders[j - 1] - 1 for j in normaal]
    gemiddeld = (orders[basisjaar] / orders[normaal[0] - 1]) ** (1 / len(normaal)) - 1

    aandelen = []
    for j in normaal:
        maanden = per_jaar_data[str(j)]["maand"]
        totaal = sum(maanden)
        aandelen.append([m / totaal for m in maanden])
    seizoen = [sum(a[m] for a in aandelen) / len(aandelen) for m in range(12)]

    return {
        "basisjaar": basisjaar,
        "prognosejaar": basisjaar + 1,
        "kanalen": per_jaar_data[str(basisjaar)]["kanalen"],
        "seizoen": [round(x, 6) for x in seizoen],
        "seizoen_jaren": normaal,
        "groei": {
            "basis": round(gemiddeld, 4),
            "laag": round(min(groei_per_jaar), 4),
            "hoog": round(max(groei_per_jaar), 4),
            "vanaf": normaal[0] - 1,
        },
    }


def main():
    if not DB.exists():
        sys.exit(f"{DB} ontbreekt, draai eerst: python laad_database.py in sultan-db/")
    with duckdb.connect(str(DB), read_only=True) as con:
        jaren = [r[0] for r in con.execute("""
            SELECT DISTINCT year(bedrijfsdag) FROM orders ORDER BY 1
        """).fetchall()]
        jaardata = {str(j): per_jaar(con, j) for j in jaren}
        data = {
            "bron": "Grillroom Sultan, synthetische oefendata van de Compain AI-dag",
            "bijgewerkt": date.today().isoformat(),
            "weekdagen": WEEKDAGEN,
            "jaren": jaren,
            "per_jaar": jaardata,
            "alle": alle_jaren(con),
            "prognose": prognose_basis(jaren, jaardata),
        }
    UIT.parent.mkdir(exist_ok=True)
    # Compact: met dagomzet erbij wordt ingesprongen JSON te groot voor de 100 KB-grens in test_data.py.
    UIT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Klaar: {UIT} ({UIT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
