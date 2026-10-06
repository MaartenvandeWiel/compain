// Sultan command center: leest data/sultan.json (totalen uit de database) en tekent per pagina.
// Pagina's: #overzicht, #financieel (of #financieel/2024, of #financieel/2024/3 voor maart), #prognose.
// Rekenwerk prognose: prognose.js.
(() => {
  "use strict";

  const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const MAANDEN_LANG = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  const WEEKDAG_KORT = ["ma", "di", "wo", "do", "vr", "za", "zo"];
  const KANAAL_NAAM = {
    "dine-in": "Dine-in",
    afhaal: "Afhaal",
    "eigen bezorging": "Eigen bezorging",
    Thuisbezorgd: "Thuisbezorgd",
    "Uber Eats": "Uber Eats",
    Deliveroo: "Deliveroo",
  };
  const PAGINAS = ["overzicht", "financieel", "prognose"];

  const euro0 = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const euro2 = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  const getal = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });
  const pct = new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });
  const pct0 = new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 0 });

  let data = null;
  let pagina = "overzicht";
  let jaar = null;
  let maand = null; // 1 t/m 12, of null voor het hele jaar
  const grafieken = {};

  const $ = (id) => document.getElementById(id);
  const css = (naam) => getComputedStyle(document.documentElement).getPropertyValue(naam).trim();
  // Onder de 10k een decimaal, anders worden stappen van 500 op de dag-as dubbele labels (€3k, €3k).
  const kort = (n) => (n >= 1000 ? `€${(n / 1000).toLocaleString("nl-NL", { maximumFractionDigits: n < 10000 ? 1 : 0 })}k` : euro0.format(n));
  const kanaalNaam = (k) => KANAAL_NAAM[k] || k;
  const laatsteJaar = () => String(data.jaren.at(-1));
  const somVan = (lijst, veld) => lijst.reduce((t, x) => t + x[veld], 0);

  function alfa(kleur, a) {
    const hex = kleur.replace("#", "");
    if (hex.length !== 6) return kleur;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  function blok(sleutel) {
    return sleutel === "alle" ? data.alle : data.per_jaar[sleutel];
  }

  function vorigJaar(sleutel) {
    if (sleutel === "alle") return null;
    return data.per_jaar[String(Number(sleutel) - 1)] || null;
  }

  // Wat Financieel nu laat zien: het jaar, of één maand daarvan. Vorige = zelfde periode een jaar eerder.
  function selectie(j = jaar) {
    const b = blok(j);
    return maand && b?.maanden ? b.maanden[maand - 1] : b;
  }

  function vorigeSelectie() {
    return jaar === "alle" ? null : selectie(String(Number(jaar) - 1)) || null;
  }

  function periode(j = jaar) {
    return maand ? `${MAANDEN[maand - 1]} ${j}` : String(j);
  }

  function delta(nu, vorig, label) {
    const verschil = nu / vorig - 1;
    return { tekst: `${pct.format(verschil)} t.o.v. ${label}`, klasse: verschil > 0 ? "op" : verschil < 0 ? "neer" : "" };
  }

  function tegels(id, lijst) {
    $(id).innerHTML = lijst.map((t) => `<article class="kerngetal${t.prognose ? " prognose" : ""}">
        <p class="kerngetal-label">${t.label}</p>
        <p class="kerngetal-waarde">${t.waarde}</p>
        <p class="kerngetal-delta ${t.klasse || ""}">${t.delta}</p>
      </article>`).join("");
  }

  // ---- Navigatie ----

  function leesHash() {
    const [deel, sub, m] = location.hash.slice(1).split("/");
    const geldigeJaren = [...data.jaren.map(String), "alle"];
    if (geldigeJaren.includes(deel)) return { pagina: "financieel", jaar: deel, maand: null }; // oude links (#2024) blijven werken
    const nieuwJaar = geldigeJaren.includes(sub) ? sub : jaar || laatsteJaar();
    const nieuwMaand = Number(m);
    return {
      pagina: PAGINAS.includes(deel) ? deel : "overzicht",
      jaar: nieuwJaar,
      maand: nieuwJaar !== "alle" && nieuwMaand >= 1 && nieuwMaand <= 12 ? nieuwMaand : null,
    };
  }

  function ga(nieuw) {
    pagina = nieuw.pagina;
    jaar = nieuw.jaar;
    maand = jaar === "alle" ? null : nieuw.maand;
    const hash = pagina === "financieel" ? `#financieel/${jaar}${maand ? `/${maand}` : ""}` : `#${pagina}`;
    if (location.hash !== hash) history.replaceState(null, "", hash);

    for (const p of PAGINAS) $(`pagina-${p}`).hidden = p !== pagina;
    document.querySelectorAll(".menu a").forEach((a) => {
      if (a.dataset.pagina === pagina) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    $("jaren").hidden = pagina !== "financieel";
    tekenPagina();
  }

  function tekenPagina() {
    const p = data.prognose;
    const koppen = {
      overzicht: ["Command center", "Stand van zaken in één scherm. Klik door voor de details."],
      financieel: ["Financieel", "Omzet, kanalen en wat er over de toonbank gaat. Per jaar, per maand of alles samen."],
      prognose: [`Prognose ${p.prognosejaar}`, `Waar ${p.prognosejaar} uitkomt als je niets verandert. Vertrekpunt is ${p.basisjaar}.`],
    };
    $("titel").textContent = koppen[pagina][0];
    $("ondertitel").textContent = koppen[pagina][1];
    document.title = `${koppen[pagina][0]} | Sultan Command Center`;
    if (pagina === "overzicht") tekenOverzicht();
    if (pagina === "financieel") tekenFinancieel();
    if (pagina === "prognose") tekenPrognose();
  }

  // ---- Grafiek-basis ----

  function basisOpties() {
    const lijn = css("--lijn");
    Chart.defaults.font.family = css("--font");
    Chart.defaults.color = css("--tekst-zacht");
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: css("--koolzwart"),
          titleColor: "#fff",
          bodyColor: "#fff",
          padding: 10,
          callbacks: { label: (c) => ` ${c.dataset.label}: ${euro0.format(c.parsed.y)}` },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { color: lijn } },
        y: { beginAtZero: true, grid: { color: lijn }, border: { display: false }, ticks: { callback: kort } },
      },
    };
  }

  const legendaRechts = () => ({ display: true, position: "top", align: "end", labels: { boxWidth: 12, boxHeight: 12 } });

  function vervang(id, config) {
    grafieken[id]?.destroy();
    grafieken[id] = new Chart($(id), config);
  }

  // ---- Overzicht ----

  function tekenOverzicht() {
    const j = laatsteJaar();
    const nu = data.per_jaar[j];
    const vorig = vorigJaar(j);
    const prog = SultanPrognose.metBandbreedte(data.prognose);
    const platforms = nu.kanalen.filter((k) => k.commissie > 0);
    const commissie = somVan(platforms, "commissie");

    const dOmzet = delta(nu.kerngetallen.omzet, vorig.kerngetallen.omzet, Number(j) - 1);
    const dProg = delta(prog.midden.omzet, nu.kerngetallen.omzet, j);
    const dBon = delta(nu.kerngetallen.gem_bon, vorig.kerngetallen.gem_bon, Number(j) - 1);
    tegels("ov-kerngetallen", [
      { label: `Omzet ${j}`, waarde: euro0.format(nu.kerngetallen.omzet), delta: dOmzet.tekst, klasse: dOmzet.klasse },
      { label: `Prognose ${prog.midden.jaar}`, waarde: euro0.format(prog.midden.omzet), delta: dProg.tekst, klasse: dProg.klasse, prognose: true },
      { label: `Platformcommissie ${j}`, waarde: euro0.format(commissie), delta: `${pct0.format(commissie / somVan(platforms, "omzet"))} van de platformomzet` },
      { label: `Gemiddelde bon ${j}`, waarde: euro2.format(nu.kerngetallen.gem_bon), delta: dBon.tekst, klasse: dBon.klasse },
    ]);

    // Omzet per jaar, met de prognose als laatste (lichtere) staaf.
    const accent = css("--accent");
    const labels = [...data.jaren.map(String), `${prog.midden.jaar}`];
    const waarden = [...data.jaren.map((x) => data.per_jaar[x].kerngetallen.omzet), prog.midden.omzet];
    const opties = basisOpties();
    opties.plugins.tooltip.callbacks.label = (c) =>
      c.dataIndex === waarden.length - 1
        ? [` Prognose: ${euro0.format(c.parsed.y)}`, ` Bandbreedte ${kort(prog.laag.omzet)} tot ${kort(prog.hoog.omzet)}`]
        : ` Omzet: ${euro0.format(c.parsed.y)}`;
    vervang("grafiek-jaren", {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Omzet",
          data: waarden,
          backgroundColor: waarden.map((_, i) => (i === waarden.length - 1 ? alfa(accent, 0.25) : accent)),
          borderColor: accent,
          borderWidth: waarden.map((_, i) => (i === waarden.length - 1 ? 2 : 0)),
          borderRadius: 3,
        }],
      },
      options: opties,
    });
    const eerste = data.per_jaar[String(data.jaren[0])].kerngetallen.omzet;
    $("ov-jaren-sub").textContent = `${pct.format(nu.kerngetallen.omzet / eerste - 1)} sinds ${data.jaren[0]}. Lichte staaf is de prognose.`;

    // Signalen: alles berekend uit de data.
    const vanaf = data.per_jaar[String(data.prognose.groei.vanaf)].kerngetallen;
    const wk = nu.weekdag;
    const wkTotaal = wk.reduce((a, b) => a + b, 0);
    const topBon = [...nu.kanalen].sort((a, b) => b.omzet / b.orders - a.omzet / a.orders)[0];
    const signalen = [
      ["Groei zit in de prijs, niet in de drukte.",
        `Sinds ${data.prognose.groei.vanaf}: orders ${pct.format(nu.kerngetallen.orders / vanaf.orders - 1)}, gemiddelde bon ${pct.format(nu.kerngetallen.gem_bon / vanaf.gem_bon - 1)}.`],
      [`Platforms kostten ${euro0.format(commissie)} in ${j}.`,
        `${platforms.map((k) => `${kanaalNaam(k.kanaal)} ${pct0.format(k.commissie / k.omzet)}`).join(", ")} van wat er via hen binnenkwam.`],
      [`Vrijdag en zaterdag: ${pct0.format((wk[4] + wk[5]) / wkTotaal)} van de omzet.`,
        `Maandag en dinsdag samen: ${pct0.format((wk[0] + wk[1]) / wkTotaal)}.`],
      [`${kanaalNaam(topBon.kanaal)} heeft de hoogste bon: ${euro2.format(topBon.omzet / topBon.orders)}.`,
        topBon.commissie === 0 ? "En daar gaat geen commissie vanaf." : `Wel met ${pct0.format(topBon.commissie / topBon.omzet)} commissie.`],
    ];
    $("ov-signalen").innerHTML = signalen.map(([kop, uitleg]) => `<li><strong>${kop}</strong><span>${uitleg}</span></li>`).join("");

    const modules = [
      { naam: "Financieel", href: "#financieel", status: "live", tekst: "Omzet per jaar, maand, weekdag en kanaal. Top 10 gerechten." },
      { naam: "Prognose", href: "#prognose", status: "live", tekst: `Waar ${prog.midden.jaar} uitkomt bij ongewijzigd beleid, met bandbreedte.` },
      { naam: "Hefbomen", status: "bouw", tekst: "Knoppen die de prognose bewegen: prijs, kanalen, bezetting." },
      { naam: "Personeel", status: "data", tekst: "Diensten en loonkosten naast de drukte per uur." },
      { naam: "Inkoop", status: "data", tekst: "Leveranciers, kostprijs en betaalgedrag." },
      { naam: "Telefonie", status: "data", tekst: "Gemiste oproepen in de piek en wat die kosten." },
    ];
    const statusTekst = { live: "Live", bouw: "In aanbouw", data: "Data ligt klaar" };
    $("ov-modules").innerHTML = modules.map((m) => {
      const binnen = `<div class="module-kop"><h3>${m.naam}</h3><span class="status status-${m.status}">${statusTekst[m.status]}</span></div><p>${m.tekst}</p>`;
      return m.href ? `<a class="module" href="${m.href}">${binnen}</a>` : `<div class="module uit">${binnen}</div>`;
    }).join("");
  }

  // ---- Financieel ----

  function tekenJaren() {
    const nav = $("jaren");
    nav.innerHTML = "";
    for (const sleutel of [...data.jaren.map(String), "alle"]) {
      const knop = document.createElement("button");
      knop.type = "button";
      knop.textContent = sleutel === "alle" ? "Alles" : sleutel;
      knop.setAttribute("aria-pressed", String(sleutel === jaar));
      knop.addEventListener("click", () => ga({ pagina: "financieel", jaar: sleutel, maand }));
      nav.appendChild(knop);
    }
  }

  function tekenMaanden() {
    const nav = $("maanden");
    nav.hidden = jaar === "alle";
    if (nav.hidden) return;
    nav.innerHTML = "";
    for (const m of [null, ...MAANDEN.map((_, i) => i + 1)]) {
      const knop = document.createElement("button");
      knop.type = "button";
      knop.textContent = m ? MAANDEN[m - 1] : "Heel jaar";
      if (m) knop.setAttribute("aria-label", MAANDEN_LANG[m - 1]);
      knop.setAttribute("aria-pressed", String(m === maand));
      knop.addEventListener("click", () => ga({ pagina: "financieel", jaar, maand: m }));
      nav.appendChild(knop);
    }
  }

  function tekenFinancieel() {
    tekenJaren();
    tekenMaanden();
    tekenKerngetallen();
    tekenMaand();
    tekenWeekdag();
    tekenToplijsten();
    tekenKanalen();
  }

  function tekenKerngetallen() {
    const nu = selectie().kerngetallen;
    const vorig = vorigeSelectie()?.kerngetallen;
    const lijst = [
      { label: "Omzet incl. btw", waarde: euro0.format(nu.omzet), sleutel: "omzet" },
      { label: "Orders", waarde: getal.format(nu.orders), sleutel: "orders" },
      { label: "Gemiddelde bon", waarde: euro2.format(nu.gem_bon), sleutel: "gem_bon" },
      { label: "Netto na platformcommissie", waarde: euro0.format(nu.netto), sleutel: "netto" },
    ];
    tegels("kerngetallen", lijst.map((t) => {
      if (vorig) {
        const d = delta(nu[t.sleutel], vorig[t.sleutel], periode(Number(jaar) - 1));
        return { ...t, delta: d.tekst, klasse: d.klasse };
      }
      return { ...t, delta: jaar === "alle" ? `${data.jaren[0]} t/m ${data.jaren.at(-1)}` : "Eerste jaar in de data" };
    }));
  }

  function tekenMaand() {
    const opties = basisOpties();
    const accent = css("--accent");
    $("maand-titel").textContent = maand ? `Omzet per dag, ${MAANDEN_LANG[maand - 1]} ${jaar}` : "Omzet per maand";
    if (maand) {
      tekenDagen(opties, accent);
      return;
    }
    if (jaar === "alle") {
      const reeks = data.alle.maand;
      opties.scales.x.ticks = { autoSkip: false, maxRotation: 0, callback: (_, i) => (reeks[i].periode.endsWith("-01") ? reeks[i].periode.slice(0, 4) : "") };
      opties.plugins.tooltip.callbacks.title = (items) => {
        const [j, m] = reeks[items[0].dataIndex].periode.split("-");
        return `${MAANDEN[Number(m) - 1]} ${j}`;
      };
      vervang("grafiek-maand", {
        type: "bar",
        data: { labels: reeks.map((r) => r.periode), datasets: [{ label: "Omzet", data: reeks.map((r) => r.omzet), backgroundColor: accent, borderRadius: 2 }] },
        options: opties,
      });
      $("maand-sub").textContent = "Vijf jaar achter elkaar. Lockdowns in 2021 zie je terug.";
      return;
    }
    const nu = blok(jaar).maand;
    const vorig = vorigJaar(jaar)?.maand;
    const sets = [{ type: "bar", label: jaar, data: nu, backgroundColor: accent, borderRadius: 3, order: 2 }];
    if (vorig) {
      sets.push({ type: "line", label: String(Number(jaar) - 1), data: vorig, borderColor: css("--vorig"), backgroundColor: css("--vorig"), borderWidth: 2, pointRadius: 2, tension: 0.3, order: 1 });
      opties.plugins.legend = legendaRechts();
    }
    // Klik op een maand om erin in te zoomen.
    opties.onClick = (_, elementen) => {
      if (elementen.length) ga({ pagina: "financieel", jaar, maand: elementen[0].index + 1 });
    };
    opties.onHover = (e, elementen) => { e.native.target.style.cursor = elementen.length ? "pointer" : "default"; };
    vervang("grafiek-maand", { data: { labels: MAANDEN, datasets: sets }, options: opties });
    const sterkst = nu.indexOf(Math.max(...nu));
    const zwakst = nu.indexOf(Math.min(...nu));
    $("maand-sub").textContent = `Sterkste maand ${MAANDEN[sterkst]}, zwakste ${MAANDEN[zwakst]}.${vorig ? " Lijn is het jaar ervoor." : ""} Klik op een maand voor de dagen.`;
  }

  function tekenDagen(opties, accent) {
    const dagen = selectie().dagen;
    const datum = (i) => new Date(Number(jaar), maand - 1, i + 1);
    const isWeekend = (i) => [5, 6].includes(datum(i).getDay()); // vrijdag en zaterdag, de lange avonden
    const dagNaam = (i) => datum(i).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
    opties.scales.x.ticks = { maxRotation: 0, autoSkip: true };
    opties.plugins.tooltip.callbacks.title = (items) => dagNaam(items[0].dataIndex);
    opties.plugins.tooltip.callbacks.label = (c) => (c.parsed.y === 0 ? " Dicht" : ` Omzet: ${euro0.format(c.parsed.y)}`);
    vervang("grafiek-maand", {
      type: "bar",
      data: {
        labels: dagen.map((_, i) => String(i + 1)),
        datasets: [{ label: "Omzet", data: dagen, backgroundColor: dagen.map((_, i) => (isWeekend(i) ? accent : css("--accent-zacht"))), borderRadius: 2 }],
      },
      options: opties,
    });
    const open = dagen.map((o, i) => [o, i]).filter(([o]) => o > 0);
    const [besteOmzet, beste] = open.reduce((a, b) => (b[0] > a[0] ? b : a));
    const [rustigOmzet, rustig] = open.reduce((a, b) => (b[0] < a[0] ? b : a));
    const dicht = dagen.length - open.length;
    $("maand-sub").textContent = `Beste dag ${dagNaam(beste)} (${euro0.format(besteOmzet)}), rustigste ${dagNaam(rustig)} (${euro0.format(rustigOmzet)}).` +
      `${dicht ? ` ${dicht === 1 ? "Eén dag" : `${dicht} dagen`} dicht.` : ""} Donker is vrijdag en zaterdag.`;
  }

  function tekenWeekdag() {
    const reeks = selectie().weekdag;
    const opties = basisOpties();
    const accent = css("--accent");
    const zacht = css("--accent-zacht");
    opties.plugins.tooltip.callbacks.title = (items) => data.weekdagen[items[0].dataIndex];
    vervang("grafiek-weekdag", {
      type: "bar",
      data: {
        labels: WEEKDAG_KORT,
        datasets: [{ label: "Omzet", data: reeks, backgroundColor: reeks.map((_, i) => (i === 4 || i === 5 ? accent : zacht)), borderRadius: 3 }],
      },
      options: opties,
    });
    const totaal = reeks.reduce((a, b) => a + b, 0);
    const weekend = (reeks[4] + reeks[5]) / totaal;
    $("weekdag-sub").textContent = `Vrijdag en zaterdag: ${Math.round(weekend * 100)}% van de omzet. Open tot drie uur.`;
  }

  function regel(item, max) {
    const breedte = Math.max(2, (item.omzet / max) * 100);
    return `<li>
      <span class="top-naam">${item.naam} <span class="top-cat">${item.categorie}</span></span>
      <span class="top-omzet">${euro0.format(item.omzet)}<span class="top-aantal">${getal.format(item.aantal)} verkocht</span></span>
      <span class="top-balk"><span style="width:${breedte.toFixed(1)}%"></span></span>
    </li>`;
  }

  function tekenToplijsten() {
    const b = blok(jaar);
    const alleenJaar = maand ? ` Hele jaar ${jaar}: per maand zit dit niet in de data.` : "";
    $("top-sub").textContent = `Op omzet. Zonder dranken en sauzen.${alleenJaar}`;
    $("dranken-sub").textContent = maand ? `Hele jaar ${jaar}. Geen alcohol, nooit gehad.` : "Geen alcohol. Nooit gehad.";
    const max = b.top_gerechten[0]?.omzet || 1;
    $("top-gerechten").innerHTML = b.top_gerechten.map((g) => regel(g, max)).join("");
    $("top-dranken").innerHTML = b.top_dranken.map((d) => `<li>
      <span class="top-naam">${d.naam}</span>
      <span class="top-omzet">${euro0.format(d.omzet)}<span class="top-aantal">${getal.format(d.aantal)} verkocht</span></span>
    </li>`).join("");
  }

  function commissieCel(bedrag) {
    return bedrag > 0 ? `<td class="commissie">−${euro0.format(bedrag)}</td>` : `<td class="nul">geen</td>`;
  }

  function tekenKanalen() {
    const lijst = selectie().kanalen;
    const omzet = somVan(lijst, "omzet");
    const orders = somVan(lijst, "orders");
    const commissie = somVan(lijst, "commissie");
    $("tabel-kanalen").innerHTML = `
      <thead><tr><th>Kanaal</th><th>Orders</th><th class="kan-weg">Gem. bon</th><th class="kan-weg">Aandeel</th><th>Omzet</th><th>Commissie</th><th class="kan-weg">Netto</th></tr></thead>
      <tbody>${lijst.map((k) => `<tr>
        <td>${kanaalNaam(k.kanaal)}</td>
        <td>${getal.format(k.orders)}</td>
        <td class="kan-weg">${euro2.format(k.omzet / k.orders)}</td>
        <td class="kan-weg">${pct0.format(k.omzet / omzet)}</td>
        <td>${euro0.format(k.omzet)}</td>
        ${commissieCel(k.commissie)}
        <td class="kan-weg">${euro0.format(k.omzet - k.commissie)}</td>
      </tr>`).join("")}</tbody>
      <tfoot><tr><td>Totaal</td><td>${getal.format(orders)}</td><td class="kan-weg">${euro2.format(omzet / orders)}</td><td class="kan-weg">100%</td>
        <td>${euro0.format(omzet)}</td>${commissieCel(commissie)}<td class="kan-weg">${euro0.format(omzet - commissie)}</td></tr></tfoot>`;
    const platformOmzet = somVan(lijst.filter((k) => k.commissie > 0), "omzet");
    $("kanaal-sub").textContent = commissie > 0
      ? `Platforms kostten ${euro0.format(commissie)} aan commissie, ${pct0.format(commissie / platformOmzet)} van hun omzet.`
      : "Geen platformcommissie.";
  }

  // ---- Prognose ----

  function tekenPrognose() {
    const basis = data.prognose;
    const { midden, laag, hoog } = SultanPrognose.metBandbreedte(basis);
    const bj = String(basis.basisjaar);
    const nu = data.per_jaar[bj];
    const kg = nu.kerngetallen;

    const dOmzet = delta(midden.omzet, kg.omzet, bj);
    const dOrders = delta(midden.orders, kg.orders, bj);
    const dNetto = delta(midden.netto, kg.netto, bj);
    tegels("pr-kerngetallen", [
      { label: `Omzet ${midden.jaar}`, waarde: euro0.format(midden.omzet), delta: dOmzet.tekst, klasse: dOmzet.klasse, prognose: true },
      { label: "Orders", waarde: getal.format(midden.orders), delta: dOrders.tekst, klasse: dOrders.klasse, prognose: true },
      { label: "Gemiddelde bon", waarde: euro2.format(midden.bon), delta: midden.instellingen.prijs === 0 ? `Prijzen gelijk aan ${bj}` : pct.format(midden.instellingen.prijs), prognose: true },
      { label: "Netto na platformcommissie", waarde: euro0.format(midden.netto), delta: dNetto.tekst, klasse: dNetto.klasse, prognose: true },
    ]);

    // Maandgrafiek: band laag-hoog, prognose als staaf, basisjaar als lijn.
    const accent = css("--accent");
    const vorigKleur = css("--vorig");
    const opties = basisOpties();
    opties.plugins.legend = { ...legendaRechts(), labels: { ...legendaRechts().labels, filter: (item) => item.text !== "Hoog" } };
    opties.plugins.tooltip.filter = (item) => item.datasetIndex >= 2; // band alleen als regel onderaan
    opties.plugins.tooltip.callbacks.afterBody = (items) => {
      const i = items[0].dataIndex;
      return ` Bandbreedte ${kort(laag.maand[i])} tot ${kort(hoog.maand[i])}`;
    };
    vervang("grafiek-prognose", {
      data: {
        labels: MAANDEN,
        datasets: [
          { type: "line", label: "Hoog", data: hoog.maand, borderWidth: 0, pointRadius: 0, fill: "+1", backgroundColor: alfa(accent, 0.15), order: 3 },
          { type: "line", label: "Bandbreedte", data: laag.maand, borderWidth: 0, pointRadius: 0, fill: false, backgroundColor: alfa(accent, 0.15), order: 3 },
          { type: "bar", label: `Prognose ${midden.jaar}`, data: midden.maand, backgroundColor: alfa(accent, 0.3), borderColor: accent, borderWidth: 2, borderRadius: 3, order: 2 },
          { type: "line", label: bj, data: nu.maand, borderColor: vorigKleur, backgroundColor: vorigKleur, borderWidth: 2, pointRadius: 2, tension: 0.3, order: 1 },
        ],
      },
      options: opties,
    });
    $("pr-maand-titel").textContent = `Prognose ${midden.jaar} per maand`;
    $("pr-maand-sub").textContent = `Bandbreedte voor het jaar: ${euro0.format(laag.omzet)} tot ${euro0.format(hoog.omzet)}. Lijn is ${bj}.`;

    // Aannames, rechtstreeks uit de bouwstenen.
    const g = basis.groei;
    const platforms = basis.kanalen.filter((k) => k.commissie > 0);
    const sj = basis.seizoen_jaren;
    $("pr-aannames").innerHTML = [
      `<strong>Vertrekpunt ${bj}</strong>, per kanaal: ${getal.format(kg.orders)} orders, ${euro0.format(kg.omzet)} omzet.`,
      `<strong>Ordergroei ${pct.format(g.basis)} per jaar.</strong> Gemiddelde sinds ${g.vanaf}. Slechtste jaar ${pct.format(g.laag)}, beste ${pct.format(g.hoog)}. Dat is de bandbreedte.`,
      `<strong>Geen prijsverhoging.</strong> De bon per kanaal blijft op het niveau van ${bj}. Een prijsstap wordt straks een hefboom.`,
      `<strong>Kanaalmix gelijk.</strong> Platforms houden hun aandeel en hun commissie: ${platforms.map((k) => `${kanaalNaam(k.kanaal)} ${pct0.format(k.commissie / k.omzet)}`).join(", ")}.`,
      `<strong>Seizoen</strong> volgens het gemiddelde van ${sj[0]} t/m ${sj.at(-1)}. Eerdere jaren tellen niet mee vanwege de lockdowns.`,
    ].map((t) => `<li>${t}</li>`).join("") +
      `<li class="let-op">Een trend doorgetrokken, geen glazen bol. En de data is synthetisch.</li>`;

    // Per kanaal.
    const kanaalVorig = Object.fromEntries(nu.kanalen.map((k) => [k.kanaal, k]));
    $("tabel-pr-kanalen").innerHTML = `
      <thead><tr><th>Kanaal</th><th class="kan-weg">Orders</th><th>Omzet</th><th>Commissie</th><th class="kan-weg">Netto</th></tr></thead>
      <tbody>${midden.kanalen.map((k) => `<tr>
        <td>${kanaalNaam(k.kanaal)}</td>
        <td class="kan-weg">${getal.format(k.orders)}</td>
        <td>${euro0.format(k.omzet)}</td>
        ${commissieCel(k.commissie)}
        <td class="kan-weg">${euro0.format(k.netto)}</td>
      </tr>`).join("")}</tbody>
      <tfoot><tr><td>Totaal</td><td class="kan-weg">${getal.format(midden.orders)}</td><td>${euro0.format(midden.omzet)}</td>
        ${commissieCel(midden.commissie)}<td class="kan-weg">${euro0.format(midden.netto)}</td></tr></tfoot>`;
    const platformComm = somVan(midden.kanalen.filter((k) => kanaalVorig[k.kanaal]?.commissie > 0), "commissie");
    $("pr-kanaal-sub").textContent = `Zonder ingreep gaat er ${euro0.format(platformComm)} naar de platforms.`;

    const platformPct = pct0.format(somVan(platforms, "commissie") / somVan(platforms, "omzet"));
    const hefbomen = [
      ["Prijsstap", "Bon omhoog per 1 januari. En wat kost dat aan orders?"],
      ["Platform naar eigen bezorging", `Thuisbezorgd en Uber Eats houden gemiddeld ${platformPct} in. Elke order die je terughaalt, houd je zelf.`],
      ["Gemiste oproepen", "Telefoon opnemen in de piek. Elke gemiste beller is een gemiste bon."],
      ["Bezetting en openingstijden", "Personeel en uren afstemmen op de drukte per uur."],
    ];
    $("pr-hefbomen").innerHTML = hefbomen.map(([kop, tekst]) => `<div class="hefboom">
        <h3>${kop}</h3><p>${tekst}</p>
        <span class="schakelaar" aria-hidden="true"><i></i>Nog niet actief</span>
      </div>`).join("");
  }

  // ---- Start ----

  async function start() {
    try {
      const antwoord = await fetch("data/sultan.json", { cache: "no-cache" });
      if (!antwoord.ok) throw new Error(`HTTP ${antwoord.status}`);
      data = await antwoord.json();
    } catch (fout) {
      $("app").innerHTML = `<p class="kaart">Data niet geladen. ${fout.message}.</p>`;
      return;
    }
    $("bijgewerkt").textContent = `Bijgewerkt op ${new Date(data.bijgewerkt).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}.`;
    $("app").setAttribute("aria-busy", "false");
    ga(leesHash());

    window.addEventListener("hashchange", () => {
      const nieuw = leesHash();
      if (nieuw.pagina !== pagina || nieuw.jaar !== jaar || nieuw.maand !== maand) ga(nieuw);
    });
    // Kleuren van de grafieken meenemen als licht/donker wisselt.
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", tekenPagina);
  }

  start();
})();
