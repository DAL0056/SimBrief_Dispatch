// api/gate.js
// ---------------------------------------------------------------------------
// Gate / terminal lookup for SimBrief Dispatch — runs on Vercel (free), so the
// AeroDataBox API key stays secret and nobody has to install anything.
//
// SETUP (all in the browser, no installs):
//   1. Get a free key: rapidapi.com  ->  search "AeroDataBox"  ->  Subscribe to
//      the free "Basic" plan  ->  copy your "X-RapidAPI-Key".
//   2. Put this file in a GitHub repo at the path  api/gate.js
//   3. vercel.com  ->  "Add New Project"  ->  Import that GitHub repo  ->  Deploy.
//   4. In the Vercel project: Settings -> Environment Variables ->
//        Name:  AERODATABOX_KEY      Value:  <your RapidAPI key>
//      then Redeploy.
//   5. Your endpoint is:  https://<your-project>.vercel.app/api/gate
//      Paste that URL into GATE_ENDPOINT near the top of the HTML file.
//
// The HTML calls:  /api/gate?flight=DAL1094&dep=KIAH&arr=KDFW
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  const flight = String(req.query.flight || "").replace(/[^A-Za-z0-9]/g, "");
  const dep    = String(req.query.dep || "").toUpperCase();

  if (!flight) { res.status(200).json({ ok: false, error: "no flight" }); return; }

  const key = process.env.AERODATABOX_KEY;
  if (!key) { res.status(200).json({ ok: false, error: "server key not set" }); return; }

  const host = "aerodatabox.p.rapidapi.com";
  const url  = `https://${host}/flights/number/${encodeURIComponent(flight)}?withAircraftImage=false&withLocation=false`;

  try {
    const r = await fetch(url, {
      headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": host }
    });
    if (!r.ok) { res.status(200).json({ ok: false, error: `api ${r.status}` }); return; }

    const data = await r.json();
    const list = Array.isArray(data) ? data : (data ? [data] : []);
    if (!list.length) { res.status(200).json({ ok: false, error: "no flight found" }); return; }

    // Prefer the leg whose departure matches the OFP origin; otherwise first.
    const f = list.find(x => {
      const a = (x.departure && x.departure.airport) || {};
      return dep && (a.icao === dep || a.iata === dep);
    }) || list[0];

    const d = f.departure || {}, a = f.arrival || {};
    const icao = (o) => (o.airport && (o.airport.icao || o.airport.iata)) || "";

    // Cache at the edge for 10 min to protect the free quota.
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=600");
    res.status(200).json({
      ok: true,
      flight: f.number || flight,
      depAirport:  icao(d),
      depTerminal: d.terminal || null,
      depGate:     d.gate || null,
      arrAirport:  icao(a),
      arrTerminal: a.terminal || null,
      arrGate:     a.gate || null
    });
  } catch (e) {
    res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
