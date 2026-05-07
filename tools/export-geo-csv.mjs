import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const placesGeo = JSON.parse(readFileSync(join(root, "data", "places.geojson"), "utf8"));
const events = JSON.parse(readFileSync(join(root, "data", "events.json"), "utf8"));

const places = new Map(placesGeo.features.map((feature) => [feature.id, feature]));
const placeEventMap = new Map();

for (const event of events) {
  for (const placeId of event.place_ids || []) {
    if (!placeEventMap.has(placeId)) placeEventMap.set(placeId, []);
    placeEventMap.get(placeId).push(event);
  }
}

const placeRows = placesGeo.features.map((feature) => {
  const eventsForPlace = placeEventMap.get(feature.id) || [];
  const coordinates = feature.geometry?.coordinates || [];
  return {
    place_id: feature.id,
    name_zh: feature.properties.name_zh || "",
    aliases: (feature.properties.aliases || []).join("|"),
    place_type: feature.properties.place_type || "",
    lng: coordinates[0] ?? "",
    lat: coordinates[1] ?? "",
    coordinate_precision: feature.properties.coordinate_precision || "",
    needs_review: String(Boolean(feature.properties.needs_review)),
    event_count: eventsForPlace.length,
    categories: [...new Set(eventsForPlace.map((event) => event.category))].join("|"),
    event_ids: eventsForPlace.map((event) => event.id).join("|"),
    notes: feature.properties.notes || ""
  };
});

const eventPlaceRows = [];
for (const event of events) {
  for (const placeId of event.place_ids || []) {
    const place = places.get(placeId);
    if (!place) continue;
    const coordinates = place.geometry?.coordinates || [];
    eventPlaceRows.push({
      event_id: event.id,
      sequence: event.sequence ?? "",
      date_start: event.date_start || "",
      date_end: event.date_end || "",
      date_label: event.date_label || "",
      event_title: event.title || "",
      category: event.category || "",
      certainty: event.certainty || "",
      place_id: placeId,
      place_name_zh: place.properties.name_zh || "",
      lng: coordinates[0] ?? "",
      lat: coordinates[1] ?? "",
      coordinate_precision: place.properties.coordinate_precision || "",
      needs_review: String(Boolean(place.properties.needs_review)),
      source_id: event.source_refs?.[0]?.source_id || "",
      source_locator: event.source_refs?.[0]?.locator || "",
      evidence_quote: event.source_refs?.[0]?.evidence_quote || ""
    });
  }
}

writeCsv(join(root, "data", "places.csv"), placeRows);
writeCsv(join(root, "data", "event_places.csv"), eventPlaceRows);

console.log(JSON.stringify({
  places_csv_rows: placeRows.length,
  event_places_csv_rows: eventPlaceRows.length
}, null, 2));

function writeCsv(filePath, rows) {
  const headers = Object.keys(rows[0] || {});
  const body = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
  ].join("\r\n");

  writeFileSync(filePath, `\uFEFF${body}\r\n`, "utf8");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
