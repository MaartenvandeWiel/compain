# Grillroom Sultan, dashboard

Dashboard met de omzet van Grillroom Sultan: vier kerngetallen, omzet per maand, omzet per weekdag, top 10 gerechten en top 3 dranken. Per jaar te bekijken (2021 t/m 2025) of alles samen.

Gebouwd op de AI-dag van Compain (6 oktober 2026). **De data is synthetisch.** Grillroom Sultan bestaat niet.

## Hoe het werkt

- De brondata staat in een lokale DuckDB-database en gaat niet online.
- `maak_data.py` rekent alleen totalen uit en schrijft die naar `data/sultan.json`. Geen orders, geen klanten, geen medewerkers.
- `test_data.py` controleert de totalen tot op de cent en checkt dat er geen order- of persoonsgegevens in de JSON zitten. Faalt de test, dan wordt er niet gepubliceerd.
- `index.html`, `app.js` en `style.css` lezen die JSON en tekenen het dashboard (Chart.js). Geen build-stap, gewoon een statische site op GitHub Pages.

## Definities

- Omzet = som van het orderbedrag incl. btw, alleen voltooide orders. Geannuleerd en gerestitueerd tellen niet mee.
- Jaar, maand en weekdag gaan op bedrijfsdag. Een order op zaterdag 01:30 telt bij vrijdag.
- Netto = omzet min de commissie van Thuisbezorgd en Uber Eats.
- Top 10 gerechten zonder dranken en sauzen, op omzet.

## Lokaal bekijken

```
python -m http.server 8765
```
Open dan http://localhost:8765.
