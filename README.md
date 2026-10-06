# Grillroom Sultan, command center

Command center van Grillroom Sultan, met een menu links (op mobiel bovenin):

- **Overzicht** (`#overzicht`): stand van zaken, omzet per jaar met prognose, wat opvalt in de cijfers en welke modules er zijn.
- **Financieel** (`#financieel/2025`): het oorspronkelijke dashboard. Kerngetallen, omzet per maand en weekdag, top 10 gerechten, top 3 dranken en omzet per kanaal. Per jaar (2021 t/m 2025) of alles samen. Binnen een jaar te filteren op maand (`#financieel/2024/10`, of klik op een maandstaaf): dan gaan kerngetallen, weekdagen en kanalen over die maand, met omzet per dag en een vergelijking met dezelfde maand een jaar eerder.
- **Prognose** (`#prognose`): waar volgend jaar uitkomt bij ongewijzigd beleid, per maand en per kanaal, met bandbreedte.
- **Hefbomen** (in aanbouw): knoppen die de prognose bewegen, zoals een prijsstap of platformorders naar eigen bezorging.

Gebouwd op de AI-dag van Compain (6 oktober 2026). **De data is synthetisch.** Grillroom Sultan bestaat niet.

## Hoe het werkt

- De brondata staat in een lokale DuckDB-database en gaat niet online.
- `maak_data.py` rekent alleen totalen uit en schrijft die naar `data/sultan.json`. Geen orders, geen klanten, geen medewerkers. Per maand komen er ook dagtotalen bij. De JSON staat daarom compact (zonder inspringing), zodat hij onder de 100 KB-grens van de test blijft.
- `test_data.py` controleert de totalen tot op de cent en checkt dat er geen order- of persoonsgegevens in de JSON zitten. Faalt de test, dan wordt er niet gepubliceerd.
- `prognose.js` is het rekenmodel: vertrekpunt is het laatste jaar per kanaal, daarop ordergroei, prijsstap en seizoenspatroon. Geen DOM, dus het draait ook in Node. Hefbomen komen hier straks als extra instellingen bij. `test_data.py` controleert het model via Node.
- `index.html`, `app.js` en `style.css` lezen die JSON en tekenen het dashboard (Chart.js). Geen build-stap, gewoon een statische site op GitHub Pages.

## Definities

- Omzet = som van het orderbedrag incl. btw, alleen voltooide orders. Geannuleerd en gerestitueerd tellen niet mee.
- Jaar, maand en weekdag gaan op bedrijfsdag. Een order op zaterdag 01:30 telt bij vrijdag.
- Netto = omzet min de commissie van Thuisbezorgd en Uber Eats.
- Top 10 gerechten zonder dranken en sauzen, op omzet. Alleen per jaar: de bron (Artikelomzet) heeft geen maandcijfers. Bij een gekozen maand staat dat erbij.
- Prognose: ordergroei = gemiddelde groei per jaar sinds 2022 (laag en hoog = slechtste en beste losse jaar), prijzen en kanaalmix gelijk aan het laatste jaar, seizoen = gemiddelde van 2023 t/m 2025. 2021 en 2022 tellen voor het seizoen niet mee vanwege de lockdowns.

## Lokaal bekijken

```
python -m http.server 8765
```
Open dan http://localhost:8765.
