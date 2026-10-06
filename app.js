// Sultan-dashboard: leest data/sultan.json (totalen uit de database) en tekent alles per gekozen jaar.
(() => {
  "use strict";

  const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const WEEKDAG_KORT = ["ma", "di", "wo", "do", "vr", "za", "zo"];
  const euro0 = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const euro2 = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  const getal = new Intl.NumberFormat("nl-NL");
  const pct = new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });

  let data = null;
  let keuze = null;
  const grafieken = {};

  const $ = (id) => document.getElementById(id);
  const css = (naam) => getComputedStyle(document.documentElement).getPropertyValue(naam).trim();
  const kort = (n) => (n >= 1000 ? `€${Math.round(n / 1000)}k` : euro0.format(n));

  function blok(sleutel) {
    return sleutel === "alle" ? data.alle : data.per_jaar[sleutel];
  }

  function vorigJaar(sleutel) {
    if (sleutel === "alle") return null;
    return data.per_jaar[String(Number(sleutel) - 1)] || null;
  }

  // ---- Jaarkeuze ----

  function tekenJaren() {
    const nav = $("jaren");
    nav.innerHTML = "";
    for (const sleutel of [...data.jaren.map(String), "alle"]) {
      const knop = document.createElement("button");
      knop.type = "button";
      knop.textContent = sleutel === "alle" ? "Alles" : sleutel;
      knop.setAttribute("aria-pressed", String(sleutel === keuze));
      knop.addEventListener("click", () => kies(sleutel));
      nav.appendChild(knop);
    }
  }

  function kies(sleutel) {
    keuze = sleutel;
    if (location.hash !== `#${sleutel}`) history.replaceState(null, "", `#${sleutel}`);
    tekenJaren();
    tekenAlles();
  }

  // ---- Kerngetallen ----

  function tekenKerngetallen() {
    const nu = blok(keuze).kerngetallen;
    const vorig = vorigJaar(keuze)?.kerngetallen;
    const tegels = [
      { label: "Omzet incl. btw", waarde: euro0.format(nu.omzet), sleutel: "omzet" },
      { label: "Orders", waarde: getal.format(nu.orders), sleutel: "orders" },
      { label: "Gemiddelde bon", waarde: euro2.format(nu.gem_bon), sleutel: "gem_bon" },
      { label: "Netto na platformcommissie", waarde: euro0.format(nu.netto), sleutel: "netto" },
    ];
    $("kerngetallen").innerHTML = tegels.map((t) => {
      let delta = keuze === "alle" ? `${data.jaren[0]} t/m ${data.jaren.at(-1)}` : "Eerste jaar in de data";
      let klasse = "";
      if (vorig) {
        const verschil = nu[t.sleutel] / vorig[t.sleutel] - 1;
        delta = `${pct.format(verschil)} t.o.v. ${Number(keuze) - 1}`;
        klasse = verschil > 0 ? "op" : verschil < 0 ? "neer" : "";
      }
      return `<article class="kerngetal">
        <p class="kerngetal-label">${t.label}</p>
        <p class="kerngetal-waarde">${t.waarde}</p>
        <p class="kerngetal-delta ${klasse}">${delta}</p>
      </article>`;
    }).join("");
  }

  // ---- Grafieken ----

  function basisOpties() {
    const tekst = css("--tekst-zacht");
    const lijn = css("--lijn");
    Chart.defaults.font.family = css("--font");
    Chart.defaults.color = tekst;
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

  function vervang(id, config) {
    grafieken[id]?.destroy();
    grafieken[id] = new Chart($(id), config);
  }

  function tekenMaand() {
    const opties = basisOpties();
    const accent = css("--accent");
    if (keuze === "alle") {
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
    const nu = blok(keuze).maand;
    const vorig = vorigJaar(keuze)?.maand;
    const sets = [{ type: "bar", label: keuze, data: nu, backgroundColor: accent, borderRadius: 3, order: 2 }];
    if (vorig) {
      sets.push({ type: "line", label: String(Number(keuze) - 1), data: vorig, borderColor: css("--vorig"), backgroundColor: css("--vorig"), borderWidth: 2, pointRadius: 2, tension: 0.3, order: 1 });
      opties.plugins.legend = { display: true, position: "top", align: "end", labels: { boxWidth: 12, boxHeight: 12 } };
    }
    vervang("grafiek-maand", { data: { labels: MAANDEN, datasets: sets }, options: opties });
    const sterkst = nu.indexOf(Math.max(...nu));
    const zwakst = nu.indexOf(Math.min(...nu));
    $("maand-sub").textContent = `Sterkste maand ${MAANDEN[sterkst]}, zwakste ${MAANDEN[zwakst]}.${vorig ? " Lijn is het jaar ervoor." : ""}`;
  }

  function tekenWeekdag() {
    const reeks = blok(keuze).weekdag;
    const opties = basisOpties();
    const accent = css("--accent");
    const zacht = css("--accent-zacht");
    vervang("grafiek-weekdag", {
      type: "bar",
      data: {
        labels: WEEKDAG_KORT,
        datasets: [{ label: "Omzet", data: reeks, backgroundColor: reeks.map((_, i) => (i === 4 || i === 5 ? accent : zacht)), borderRadius: 3 }],
      },
      options: { ...opties, plugins: { ...opties.plugins, tooltip: { ...opties.plugins.tooltip, callbacks: { ...opties.plugins.tooltip.callbacks, title: (items) => data.weekdagen[items[0].dataIndex] } } } },
    });
    const totaal = reeks.reduce((a, b) => a + b, 0);
    const weekend = (reeks[4] + reeks[5]) / totaal;
    $("weekdag-sub").textContent = `Vrijdag en zaterdag: ${Math.round(weekend * 100)}% van de omzet. Open tot drie uur.`;
  }

  // ---- Toplijsten ----

  function regel(item, max) {
    const breedte = Math.max(2, (item.omzet / max) * 100);
    return `<li>
      <span class="top-naam">${item.naam} <span class="top-cat">${item.categorie}</span></span>
      <span class="top-omzet">${euro0.format(item.omzet)}<span class="top-aantal">${getal.format(item.aantal)} verkocht</span></span>
      <span class="top-balk"><span style="width:${breedte.toFixed(1)}%"></span></span>
    </li>`;
  }

  function tekenToplijsten() {
    const b = blok(keuze);
    const max = b.top_gerechten[0]?.omzet || 1;
    $("top-gerechten").innerHTML = b.top_gerechten.map((g) => regel(g, max)).join("");
    $("top-dranken").innerHTML = b.top_dranken.map((d) => `<li>
      <span class="top-naam">${d.naam}</span>
      <span class="top-omzet">${euro0.format(d.omzet)}<span class="top-aantal">${getal.format(d.aantal)} verkocht</span></span>
    </li>`).join("");
  }

  function tekenAlles() {
    tekenKerngetallen();
    tekenMaand();
    tekenWeekdag();
    tekenToplijsten();
  }

  // ---- Start ----

  async function start() {
    try {
      const antwoord = await fetch("data/sultan.json", { cache: "no-cache" });
      if (!antwoord.ok) throw new Error(`HTTP ${antwoord.status}`);
      data = await antwoord.json();
    } catch (fout) {
      $("app").innerHTML = `<p class="kaart kaart-breed">Data niet geladen. ${fout.message}.</p>`;
      return;
    }
    const gevraagd = location.hash.slice(1);
    const geldig = [...data.jaren.map(String), "alle"];
    keuze = geldig.includes(gevraagd) ? gevraagd : String(data.jaren.at(-1));
    $("bijgewerkt").textContent = `Bijgewerkt op ${new Date(data.bijgewerkt).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}.`;
    $("app").setAttribute("aria-busy", "false");
    kies(keuze);

    window.addEventListener("hashchange", () => {
      const h = location.hash.slice(1);
      if (geldig.includes(h) && h !== keuze) kies(h);
    });
    // Kleuren van de grafieken meenemen als licht/donker wisselt.
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", tekenAlles);
  }

  start();
})();
