// Calcula centroide de un GeoJSON Polygon
export function calcularCentroide(geojson) {
  try {
    const coords = geojson.coordinates[0];
    let sumLat = 0, sumLon = 0;
    const n = coords.length - 1;
    for (let i = 0; i < n; i++) {
      sumLon += coords[i][0];
      sumLat += coords[i][1];
    }
    return { lat: sumLat / n, lon: sumLon / n };
  } catch {
    return null;
  }
}

// Estima zoom según el tamaño del bounding box del polígono
export function calcularZoom(geojson) {
  try {
    const coords = geojson.coordinates[0];
    const lats = coords.map(c => c[1]);
    const lons = coords.map(c => c[0]);
    const deltaLat = Math.max(...lats) - Math.min(...lats);
    const deltaLon = Math.max(...lons) - Math.min(...lons);
    const delta = Math.max(deltaLat, deltaLon);
    const metros = delta * 111000 * 1.5;
    return Math.min(Math.max(Math.round(metros), 500), 500000);
  } catch {
    return 8000;
  }
}
