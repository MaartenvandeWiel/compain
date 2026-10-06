"""Rekent de totalen voor het Sultan-dashboard uit en schrijft ze naar data/sultan.json.

Leest sultan-db/sultan.duckdb alleen-lezen. Er gaan ALLEEN totalen naar buiten: geen order-, klant- of
medewerkergegevens. Deze map wordt publiek gemaakt, dus wat hier in de JSON komt, kan iedereen zien.

Definities (zie ../CLAUDE.md): omzet = som van totaal_incl_btw over orders met status 'voltooid',
jaar, maand en weekdag gaan op bedrijfsdag.
Gebruik: python maak_data.py   (eerst python laad_database.py in ../sultan-db)
"""
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
        "top_gerechten": top_artikelen(con, "true", gerechten=True, aantal=10),
        "top_dranken": top_artikelen(con, "true", gerechten=False, aantal=3),
    }


def main():
    if not DB.exists():
        sys.exit(f"{DB} ontbreekt, draai eerst: python laad_database.py in sultan-db/")
    with duckdb.connect(str(DB), read_only=True) as con:
        jaren = [r[0] for r in con.execute("""
            SELECT DISTINCT year(bedrijfsdag) FROM orders ORDER BY 1
        """).fetchall()]
        data = {
            "bron": "Grillroom Sultan, synthetische oefendata van de Compain AI-dag",
            "bijgewerkt": date.today().isoformat(),
            "weekdagen": WEEKDAGEN,
            "jaren": jaren,
            "per_jaar": {str(j): per_jaar(con, j) for j in jaren},
            "alle": alle_jaren(con),
        }
    UIT.parent.mkdir(exist_ok=True)
    UIT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Klaar: {UIT} ({UIT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
