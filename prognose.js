// Prognosemodel van het Sultan command center. Puur rekenen, geen DOM: draait in de browser en in Node (test_data.py).
//
// Vertrekpunt is het laatste jaar per kanaal (orders, omzet, commissie). Daarop:
//   orders  = orders basisjaar x (1 + ordergroei)
//   omzet   = orders x bon basisjaar x (1 + prijsstap)
//   netto   = omzet min platformcommissie (zelfde percentage per kanaal als in het basisjaar)
//   maanden = jaaromzet verdeeld volgens het gemiddelde seizoenspatroon
//
// Hefbomen komen straks als extra velden in `instellingen` en passen de kanalen aan voordat er opgeteld wordt.
(function (root) {
  "use strict";

  function standaard(basis) {
    return { groei: basis.groei.basis, prijs: 0 };
  }

  function bereken(basis, instellingen) {
    const inst = Object.assign(standaard(basis), instellingen || {});
    const ordersFactor = 1 + inst.groei;
    const prijsFactor = 1 + inst.prijs;

    const kanalen = basis.kanalen.map((k) => {
      const orders = k.orders * ordersFactor;
      const omzet = k.omzet * ordersFactor * prijsFactor;
      const commissie = k.omzet > 0 ? omzet * (k.commissie / k.omzet) : 0;
      return { kanaal: k.kanaal, orders, omzet, commissie, netto: omzet - commissie, bon: orders > 0 ? omzet / orders : 0 };
    });

    const som = (veld) => kanalen.reduce((t, k) => t + k[veld], 0);
    const omzet = som("omzet");
    const orders = som("orders");
    const seizoenTotaal = basis.seizoen.reduce((t, s) => t + s, 0);

    return {
      jaar: basis.prognosejaar,
      instellingen: inst,
      omzet,
      orders,
      commissie: som("commissie"),
      netto: som("netto"),
      bon: orders > 0 ? omzet / orders : 0,
      kanalen,
      maand: basis.seizoen.map((s) => (omzet * s) / seizoenTotaal),
    };
  }

  // Basis plus een laag en hoog scenario op dezelfde instellingen, alleen met andere ordergroei.
  function metBandbreedte(basis, instellingen) {
    const midden = bereken(basis, instellingen);
    const laag = bereken(basis, Object.assign({}, instellingen, { groei: basis.groei.laag }));
    const hoog = bereken(basis, Object.assign({}, instellingen, { groei: basis.groei.hoog }));
    return { midden, laag, hoog };
  }

  const api = { standaard, bereken, metBandbreedte };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SultanPrognose = api;
})(this);
