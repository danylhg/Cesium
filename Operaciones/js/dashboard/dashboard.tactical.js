// js/dashboard/dashboard.tactical.js

import { dashboardState } from "./dashboard.state.js";
import { dom } from "./dashboard.dom.js";
import { setRouteInfo, updateSelectionInfo } from "./dashboard.ui.js";
import { getCurrentOperation } from "./dashboard.storage.js";
import { clearPlanningArea, finishPlanningAreaByPoints } from "./dashboard.area.js";
import { saveTacticalData } from "./dashboard.persistence.js";
const SCALE_BY_DIST = new Cesium.NearFarScalar(1e3, 1.5, 2e6, 0.1);

// Escala los íconos/etiquetas proporcionalmente a la distancia de la cámara:
// cerca (1 km) → escala normal; lejos (2 000 km) → escala mínima visible.
const COLOR_HEX_MAP = {
  red:    '#FF4500',
  blue:   '#00BFFF',
  black:  '#222222',
  yellow: '#FFD700',
  green:  '#00FF88',
  orange: '#FF8C00',
  white:  '#FFFFFF'
};

export function getCesiumColor(name, alpha = 1) {
  const map = {
    red: Cesium.Color.RED,
    blue: Cesium.Color.CYAN,
    black: Cesium.Color.BLACK,
    yellow: Cesium.Color.YELLOW,
    green: Cesium.Color.LIME,
    orange: Cesium.Color.ORANGE,
    white: Cesium.Color.WHITE
  };

  const base = map[name] || Cesium.Color.WHITE;
  return base.withAlpha(alpha);
}

// IDs de POIs que acabo de enviar yo (evita redibujar lo que ya dibujé localmente)
const _mySentPoiIds = new Set();

function buildMilUniqueName(baseName) {
  const normalizedBase = String(baseName || "Simbolo MIL").trim() || "Simbolo MIL";
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
    String(now.getMilliseconds()).padStart(3, "0")
  ].join("");
  return `${normalizedBase} ${stamp}`;
}

function getPoiDisplayLabel(poi) {
  const rawLabel = String(poi.nombre || poi.name || "PDI");
  const tipoPoi = String(poi.tipo_poi || poi.tipoPoi || "").toUpperCase();
  if (tipoPoi === "MIL") {
    return rawLabel.replace(/\s\d{17}$/, "");
  }
  return rawLabel;
}

function resolvePoiImage(iconSrc) {
  if (!iconSrc) return null;
  if (/^(https?:)?\/\//i.test(iconSrc) || iconSrc.startsWith("data:")) return iconSrc;
  const apiBase = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
  return `${apiBase.replace(/\/$/, "")}/${iconSrc.replace(/^\.?\//, "")}`;
}

function buildPoiEntity(poi, tacticalType = "poi") {
  const viewer = dashboardState.viewer;
  if (!viewer) return null;

  const lat = Number(poi.latitud ?? poi.lat);
  const lng = Number(poi.longitud ?? poi.lon ?? poi.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const iconSrc = resolvePoiImage(poi.icono_src || poi.iconSrc || poi.image);
  const isMil = (poi.tipo_poi || poi.tipoPoi || "").toUpperCase() === "MIL" && !!iconSrc;
  const hexColor = poi.color || "#FFD700";
  const cesiumColor = Cesium.Color.fromCssColorString(hexColor);
  const label = getPoiDisplayLabel(poi);
  const entityId = poi.id_poi ? `poi_${poi.id_poi}` : undefined;

  if (entityId && viewer.entities.getById(entityId)) {
    return null;
  }

  return viewer.entities.add({
    id: entityId,
    name: label,
    position: Cesium.Cartesian3.fromDegrees(lng, lat),
    billboard: iconSrc ? {
      image: iconSrc,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      scale: Number(poi.scale || (isMil ? 0.08 : 0.08))
    } : undefined,
    point: !iconSrc ? {
      pixelSize: 10,
      color: cesiumColor,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    } : undefined,
    label: {
      text: label,
      font: "14px sans-serif",
      pixelOffset: iconSrc ? new Cesium.Cartesian2(0, 15) : new Cesium.Cartesian2(0, -20),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      showBackground: !iconSrc,
      backgroundColor: !iconSrc ? cesiumColor.withAlpha(0.7) : undefined,
      backgroundPadding: !iconSrc ? new Cesium.Cartesian2(6, 4) : undefined
    },
    properties: {
      tacticalType: isMil ? "mil-dropped" : tacticalType,
      draggable: true,
      id_poi: poi.id_poi ?? null
    }
  });
}

async function savePoiToBackend(lat, lng, nombre, tipoPoi, colorName, iconoSrc = null) {
  try {
    const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
    const token    = localStorage.getItem("token");
    const opId     = localStorage.getItem("active_operation_id");
    if (!token || !opId) return;

    const userData = JSON.parse(localStorage.getItem("userData") || "{}");
    const tabla    = userData.tabla || "usuario";
    const idKey    = tabla === "personal" ? "id_personal" : "id_usuario";
    const idVal    = tabla === "personal" ? userData.id_personal : userData.id_usuario;

    const body = {
      nombre,
      tipo_poi:      tipoPoi,
      latitud:       lat,
      longitud:      lng,
      color:         COLOR_HEX_MAP[colorName] || '#FFD700',
      icono_src:     iconoSrc,
      tipo_creador:  tabla === "personal" ? "PERSONAL" : "USUARIO",
      [idKey]:       idVal
    };

    const res  = await fetch(`${API_BASE}/ops/${opId}/pois`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      const mensaje = data?.mensaje || "No se pudo guardar el punto de interés.";
      if (dom.tbHint) dom.tbHint.textContent = mensaje;
      alert(mensaje);
      return null;
    }
    if (data?.ok && data?.poi?.id_poi) {
      // Marcar como "mío" para no redibujar cuando llegue el socket event
      _mySentPoiIds.add(data.poi.id_poi);
      setTimeout(() => _mySentPoiIds.delete(data.poi.id_poi), 5000);
      return data.poi;
    }
    return null;
  } catch (err) {
    console.error("Error guardando POI en backend:", err);
    if (dom.tbHint) {
      dom.tbHint.textContent = "Error de conexión al guardar el punto de interés.";
    }
    alert("Error de conexión al guardar el punto de interés.");
    return null;
  }
}

export function getLineWidth() {
  return Number(dom.widthRange?.value || 3);
}

export function getOpacity() {
  return Number(dom.opacityRange?.value || 0.35);
}

export function getRadius() {
  return Number(dom.radiusInput?.value || 5000);
}

export function getCurrentLabel() {
  return (dom.symLabel?.value || "").trim();
}

export function getCurrentColorName() {
  return dom.colorSelect?.value || "red";
}

export function toCartesianArray(points) {
  return points.map(p => Cesium.Cartesian3.fromDegrees(p.lng, p.lat));
}

export function addTacticalEntity(entity) {
  dashboardState.tacticalEntities.push(entity);
  saveTacticalData();
  return entity;
}

export function resetDrawingState() {
  dashboardState.placingMode = false;
  dashboardState.drawingPoints = [];

  const viewer = dashboardState.viewer;
  if (viewer) {
    dashboardState.drawingVertexEntities.forEach(ent => viewer.entities.remove(ent));

    if (dashboardState.tacticalPreviewLine) {
      viewer.entities.remove(dashboardState.tacticalPreviewLine);
    }

    if (dashboardState.tacticalPreviewFill) {
      viewer.entities.remove(dashboardState.tacticalPreviewFill);
    }
  }

  dashboardState.drawingVertexEntities = [];
  dashboardState.tacticalPreviewLine = null;
  dashboardState.tacticalPreviewFill = null;
}

export function updateTacticalPreview(currentLat, currentLng) {
  const viewer = dashboardState.viewer;
  if (!viewer || dashboardState.drawingPoints.length === 0 || !dashboardState.placingMode) return;

  const validModes = ["polygon", "polyline", "perimeter"];
  if (!validModes.includes(dashboardState.toolMode)) return;

  const previewPoints = [
    ...dashboardState.drawingPoints,
    { lat: currentLat, lng: currentLng }
  ];

  if (dashboardState.toolMode === "polygon" || dashboardState.toolMode === "perimeter") {
    previewPoints.push(dashboardState.drawingPoints[0]);
  }

  if (dashboardState.tacticalPreviewLine) {
    viewer.entities.remove(dashboardState.tacticalPreviewLine);
  }

  if (dashboardState.tacticalPreviewFill) {
    viewer.entities.remove(dashboardState.tacticalPreviewFill);
  }

  const dashColor =
    dashboardState.toolMode === "perimeter"
      ? Cesium.Color.RED
      : Cesium.Color.YELLOW;

  dashboardState.tacticalPreviewLine = viewer.entities.add({
    polyline: {
      positions: toCartesianArray(previewPoints),
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({
        color: dashColor,
        dashLength: 12
      }),
      clampToGround: true
    }
  });

  if (dashboardState.toolMode === "polygon" && dashboardState.drawingPoints.length >= 2) {
    const polyPoints = [
      ...dashboardState.drawingPoints,
      { lat: currentLat, lng: currentLng }
    ];

    dashboardState.tacticalPreviewFill = viewer.entities.add({
      polygon: {
        hierarchy: toCartesianArray(polyPoints),
        material: Cesium.Color.WHITE.withAlpha(0.15),
        perPositionHeight: false
      }
    });
  } else {
    dashboardState.tacticalPreviewFill = null;
  }
}

export function setTacticalUI() {
  const currentOperation = getCurrentOperation();
  const isMil = dashboardState.toolMode === "mil";
  const isPoi = dashboardState.toolMode === "poi";
  const isPlanningOperation = (currentOperation?.phase || "").toLowerCase() === "planificada";
  const needsLabel = ["mil", "poi", "label", "circle", "polygon", "polyline", "perimeter", "building"].includes(dashboardState.toolMode);
  const needsRadius = dashboardState.toolMode === "circle";
  const isMultiPoint = ["polygon", "polyline", "perimeter"].includes(dashboardState.toolMode);
  const showCancelButton = !isMil && !isPoi;
  const showFinishButton = isMultiPoint || dashboardState.areaDrawing;
  const showLabelInput = needsLabel && !isMil;
  const showColorInput = !isMil;
  const showOpacityInput = !isMil && !isPoi;
  const showWidthInput = !isMil && !isPoi;

  const milTitle = document.getElementById("milSymbolTitle");
  if (milTitle) milTitle.style.display = isMil ? "block" : "none";

  if (dom.iconPallet) dom.iconPallet.style.display = isMil ? "flex" : "none";
  if (dom.iconSettings) dom.iconSettings.style.display = "none";

  if (dom.symLabelContainer) dom.symLabelContainer.style.display = showLabelInput ? "block" : "none";
  if (dom.colorContainer) dom.colorContainer.style.display = showColorInput ? "block" : "none";
  if (dom.opacityContainer) dom.opacityContainer.style.display = showOpacityInput ? "block" : "none";
  if (dom.widthContainer) dom.widthContainer.style.display = showWidthInput ? "block" : "none";
  if (dom.tacticalActionButtons) dom.tacticalActionButtons.style.display = isMil ? "none" : "grid";
  if (dom.cancelPlace) dom.cancelPlace.style.display = showCancelButton ? "" : "none";
  if (dom.finishShape) dom.finishShape.style.display = showFinishButton ? "" : "none";
  if (dom.clearTactical) dom.clearTactical.style.display = isPlanningOperation ? "" : "none";

  if (dom.symLabel) dom.symLabel.disabled = !showLabelInput;
  if (dom.radiusInput) dom.radiusInput.disabled = !needsRadius;
  if (dom.radiusContainer) {
    dom.radiusContainer.style.display = needsRadius ? "block" : "none";
  }

  if (dom.placeBtn) {
    dom.placeBtn.disabled = dashboardState.toolMode === "none" || isMil;
    dom.placeBtn.style.display = isMil ? "none" : "";
  }
  if (dom.finishShape) dom.finishShape.disabled = !isMultiPoint && !dashboardState.areaDrawing;

  if (!dom.tbHint) return;

  if (dashboardState.toolMode === "none" && !dashboardState.areaDrawing) {
    dom.tbHint.textContent = "Selecciona una herramienta para comenzar.";
  }
  if (dashboardState.toolMode === "mil") {
    dom.tbHint.textContent = "Herramienta MIL: Arrastra el símbolo que desees desde el panel superior hacia el mapa.";
  }
  if (dashboardState.toolMode === "poi") {
    dom.tbHint.textContent = "Presiona 'Colocar / iniciar' y haz clic para poner un punto de interés.";
  }
  if (dashboardState.toolMode === "building") {
    dom.tbHint.textContent = "Presiona 'Colocar / iniciar' y haz clic para poner un edificio.";
  }
  if (dashboardState.toolMode === "label") {
    dom.tbHint.textContent = "Presiona 'Colocar / iniciar' y haz clic para poner una etiqueta. Se puede mover.";
  }
  if (dashboardState.toolMode === "circle") {
    dom.tbHint.textContent = "Presiona 'Colocar / iniciar' y haz clic en el centro del círculo. Se puede mover.";
  }
  if (dashboardState.toolMode === "polygon") {
    dom.tbHint.textContent = "Presiona 'Colocar / iniciar', da varios clics y luego 'Terminar figura'.";
  }
  if (dashboardState.toolMode === "polyline") {
    dom.tbHint.textContent = "Presiona 'Colocar / iniciar', da varios clics y luego 'Terminar figura'.";
  }
  if (dashboardState.toolMode === "perimeter") {
    dom.tbHint.textContent = "Presiona 'Colocar / iniciar', marca el perímetro y luego 'Terminar figura'.";
  }
}

export async function createPoi(lat, lng, iconPath = null) {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  const label = getCurrentLabel() || (dashboardState.toolMode === "building" ? "Edificio" : "Punto de interés");
  const color = getCesiumColor(getCurrentColorName(), 1);

  if (dashboardState.toolMode === "poi") {
    const savedPoi = await savePoiToBackend(lat, lng, label, "PDI", getCurrentColorName());
    if (!savedPoi) return;

    const ent = buildPoiEntity(savedPoi, "poi");
    if (ent) {
      addTacticalEntity(ent);
      if (dom.tbHint) dom.tbHint.textContent = `${label} colocado.`;
    }
    return;
  }

  const ent = viewer.entities.add({
    name: label,
    position: Cesium.Cartesian3.fromDegrees(lng, lat),
    billboard: iconPath ? {
      image: iconPath,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      scale: 0.08,
      scaleByDistance: SCALE_BY_DIST
    } : undefined,
    point: !iconPath ? {
      pixelSize: 10,
      color,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      scaleByDistance: SCALE_BY_DIST
    } : undefined,
    label: {
      text: label,
      font: "14px sans-serif",
      pixelOffset: iconPath ? new Cesium.Cartesian2(0, 15) : new Cesium.Cartesian2(0, -20),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      scaleByDistance: SCALE_BY_DIST
    },
    properties: {
      tacticalType: dashboardState.toolMode,
      draggable: true
    }
  });

  addTacticalEntity(ent);
  if (dom.tbHint) dom.tbHint.textContent = `${label} colocado.`;
}

export async function createMilSymbol(lat, lng, nombre, iconPath, scale = 0.08) {
  const uniqueName = buildMilUniqueName(nombre);
  const savedPoi = await savePoiToBackend(lat, lng, uniqueName, "MIL", "red", iconPath);
  if (!savedPoi) return;

  const ent = buildPoiEntity({ ...savedPoi, scale }, "poi");
  if (ent) {
    addTacticalEntity(ent);
    if (dom.tbHint) dom.tbHint.textContent = `${nombre} colocado.`;
  }
}

export function createLabel(lat, lng) {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  const label = getCurrentLabel() || "Etiqueta";
  const color = getCesiumColor(getCurrentColorName(), 1);

  const ent = viewer.entities.add({
    name: label,
    position: Cesium.Cartesian3.fromDegrees(lng, lat),
    label: {
      text: label,
      font: "16px sans-serif",
      fillColor: color,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      scaleByDistance: SCALE_BY_DIST
    },
    properties: {
      tacticalType: "label",
      draggable: true
    }
  });

  addTacticalEntity(ent);
  if (dom.tbHint) dom.tbHint.textContent = "Etiqueta colocada.";
}

export function createCircle(lat, lng) {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  const label = getCurrentLabel();
  const colorName = getCurrentColorName();
  const fill = getCesiumColor(colorName, getOpacity());
  const outline = getCesiumColor(colorName, 1);
  const radius = getRadius();

  const ent = viewer.entities.add({
    name: label || "Círculo táctico",
    position: Cesium.Cartesian3.fromDegrees(lng, lat),
    ellipse: {
      semiMajorAxis: radius,
      semiMinorAxis: radius,
      material: fill,
      outline: true,
      outlineColor: outline,
      outlineWidth: getLineWidth(),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    },
    label: label ? {
      text: label,
      font: "14px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    } : undefined,
    properties: {
      tacticalType: "circle",
      draggable: true
    }
  });

  addTacticalEntity(ent);
  if (dom.tbHint) dom.tbHint.textContent = "Círculo táctico colocado.";
}

export function finishPolygon() {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  if (dashboardState.drawingPoints.length < 3) {
    if (dom.tbHint) dom.tbHint.textContent = "El polígono requiere al menos 3 puntos.";
    return;
  }

  const positions = toCartesianArray(dashboardState.drawingPoints);
  const fill = getCesiumColor(getCurrentColorName(), getOpacity());
  const outline = getCesiumColor(getCurrentColorName(), 1);
  const label = getCurrentLabel();

  const ent = viewer.entities.add({
    name: label || "Polígono táctico",
    polygon: {
      hierarchy: positions,
      material: fill,
      outline: true,
      outlineColor: outline,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      perPositionHeight: false
    },
    properties: {
      tacticalType: "polygon",
      draggable: false
    }
  });

  addTacticalEntity(ent);

  if (label) {
    const center = dashboardState.drawingPoints[0];
    const labelEnt = viewer.entities.add({
      name: label,
      position: Cesium.Cartesian3.fromDegrees(center.lng, center.lat),
      label: {
        text: label,
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        scaleByDistance: SCALE_BY_DIST
      },
      properties: {
        tacticalType: "label",
        draggable: true
      }
    });
    addTacticalEntity(labelEnt);
  }

  resetDrawingState();
  if (dom.tbHint) dom.tbHint.textContent = "Polígono táctico completado.";
  setTacticalUI();
}

export function finishPolyline() {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  if (dashboardState.drawingPoints.length < 2) {
    if (dom.tbHint) dom.tbHint.textContent = "La línea requiere al menos 2 puntos.";
    return;
  }

  const positions = toCartesianArray(dashboardState.drawingPoints);
  const color = getCesiumColor(getCurrentColorName(), 1);
  const label = getCurrentLabel();

  const ent = viewer.entities.add({
    name: label || "Línea táctica",
    polyline: {
      positions,
      width: getLineWidth(),
      material: color,
      clampToGround: true
    },
    properties: {
      tacticalType: "polyline",
      draggable: false
    }
  });

  addTacticalEntity(ent);

  if (label) {
    const last = dashboardState.drawingPoints[dashboardState.drawingPoints.length - 1];
    const labelEnt = viewer.entities.add({
      name: label,
      position: Cesium.Cartesian3.fromDegrees(last.lng, last.lat),
      label: {
        text: label,
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        scaleByDistance: SCALE_BY_DIST
      },
      properties: {
        tacticalType: "label",
        draggable: true
      }
    });
    addTacticalEntity(labelEnt);
  }

  resetDrawingState();
  if (dom.tbHint) dom.tbHint.textContent = "Línea táctica completada.";
  setTacticalUI();
}

export function finishPerimeter() {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  if (dashboardState.drawingPoints.length < 3) {
    if (dom.tbHint) dom.tbHint.textContent = "El perímetro requiere al menos 3 puntos.";
    return;
  }

  const closed = [...dashboardState.drawingPoints, dashboardState.drawingPoints[0]];
  const positions = toCartesianArray(closed);
  const color = getCesiumColor(getCurrentColorName(), 1);
  const label = getCurrentLabel();

  const ent = viewer.entities.add({
    name: label || "Perímetro punteado",
    polyline: {
      positions,
      width: getLineWidth(),
      material: new Cesium.PolylineDashMaterialProperty({
        color,
        dashLength: 16
      }),
      clampToGround: true
    },
    properties: {
      tacticalType: "perimeter",
      draggable: false
    }
  });

  addTacticalEntity(ent);

  if (label) {
    const first = dashboardState.drawingPoints[0];
    const labelEnt = viewer.entities.add({
      name: label,
      position: Cesium.Cartesian3.fromDegrees(first.lng, first.lat),
      label: {
        text: label,
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        scaleByDistance: SCALE_BY_DIST
      },
      properties: {
        tacticalType: "label",
        draggable: true
      }
    });
    addTacticalEntity(labelEnt);
  }

  resetDrawingState();
  if (dom.tbHint) dom.tbHint.textContent = "Perímetro completado.";
  setTacticalUI();
}

export function handleTacticalPlacement(lat, lng) {
  const viewer = dashboardState.viewer;
  if (!viewer) return false;

  if (!dashboardState.placingMode || dashboardState.toolMode === "none") return false;
  if (dashboardState.toolMode === "mil") return false;

  if (dashboardState.toolMode === "poi") {
    createPoi(lat, lng);
    dashboardState.placingMode = false;
    setTacticalUI();
    return true;
  }

  if (dashboardState.toolMode === "building") {
    createPoi(lat, lng, "img/estructuras/casa.webp");
    dashboardState.placingMode = false;
    setTacticalUI();
    return true;
  }

  if (dashboardState.toolMode === "label") {
    createLabel(lat, lng);
    dashboardState.placingMode = false;
    setTacticalUI();
    return true;
  }

  if (dashboardState.toolMode === "circle") {
    createCircle(lat, lng);
    dashboardState.placingMode = false;
    setTacticalUI();
    return true;
  }

  if (["polygon", "polyline", "perimeter"].includes(dashboardState.toolMode)) {
    dashboardState.drawingPoints.push({ lat, lng });

    const ent = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lng, lat),
      point: {
        pixelSize: 8,
        color: Cesium.Color.RED,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      }
    });

    dashboardState.drawingVertexEntities.push(ent);

    if (dom.tbHint) {
      dom.tbHint.textContent = `Punto agregado (${dashboardState.drawingPoints.length}). Continúa marcando y luego usa "Terminar figura".`;
    }
    return true;
  }

  return false;
}

export function isDraggableEntity(entity) {
  if (!entity) return false;
  const draggable = entity.properties?.draggable?.getValue?.() ?? entity.properties?.draggable;
  return Boolean(draggable && entity.position);
}

export function deleteSelectedEntity() {
  const viewer = dashboardState.viewer;
  if (!dashboardState.selectedEntity || !viewer) return;

  if (
    dashboardState.selectedEntity === dashboardState.planningAreaFill ||
    dashboardState.selectedEntity === dashboardState.planningAreaBorder ||
    dashboardState.selectedEntity === dashboardState.planningAreaLabel
  ) {
    clearPlanningArea();
  } else {
    viewer.entities.remove(dashboardState.selectedEntity);
    dashboardState.tacticalEntities = dashboardState.tacticalEntities.filter(
      ent => ent !== dashboardState.selectedEntity
    );
  }

  dashboardState.selectedEntity = null;
  updateSelectionInfo(dashboardState.selectedEntity);

  saveTacticalData();

  if (dom.entityPopup) {
    dom.entityPopup.style.display = "none";
  }
}

export async function loadPoisFromBackend() {
  const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
  const token    = localStorage.getItem("token");
  const opId     = localStorage.getItem("active_operation_id");
  const viewer   = dashboardState.viewer;
  if (!token || !opId || !viewer) return;

  try {
    const res  = await fetch(`${API_BASE}/ops/${opId}/pois`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const pois = data.items || [];

    pois.forEach(poi => {
      if (!poi?.id_poi) return;
      const ent = buildPoiEntity(poi, "poi");
      if (ent) addTacticalEntity(ent);
    });
  } catch (err) {
    console.error("[POI] Error cargando POIs desde backend:", err);
  }
}

export function initPoiSocket(socket) {
  socket.on("poi_creado", ({ poi }) => {
    if (!poi?.id_poi) return;
    // Saltar si soy yo quien lo creó (ya lo dibujé localmente)
    if (_mySentPoiIds.has(poi.id_poi)) return;

    const viewer = dashboardState.viewer;
    if (!viewer) return;

    const ent = buildPoiEntity(poi, "poi");
    if (ent) addTacticalEntity(ent);
  });

  socket.on("poi_eliminado", ({ id_poi }) => {
    // Busca y elimina la entidad del viewer si fue marcada con ese ID
    // (solo aplica si en el futuro se guarda el id_poi en la entidad)
  });
}

export function bindTacticalEvents() {
  if (dom.toolSelect) {
    dom.toolSelect.addEventListener("change", (e) => {
      dashboardState.toolMode = e.target.value;
      resetDrawingState();
      setTacticalUI();
    });
  }

  if (dom.iconScale) {
    dom.iconScale.addEventListener("input", (e) => {
      const ent = dashboardState.selectedEntity;
      if (ent && ent.properties?.tacticalType?.getValue?.() === "mil-dropped") {
        ent.billboard.scale = Number(e.target.value);
      }
    });
  }

  if (dom.placeBtn) {
    dom.placeBtn.addEventListener("click", () => {
      if (dashboardState.toolMode === "mil") return;
      dashboardState.placingMode = true;
      dashboardState.drawingPoints = [];
      if (dom.tbHint) {
        dom.tbHint.textContent = "Modo activo. Usa el mapa para colocar elementos.";
      }
    });
  }

  if (dom.cancelPlace) {
    dom.cancelPlace.addEventListener("click", () => {
      resetDrawingState();
      if (dom.tbHint) dom.tbHint.textContent = "Acción cancelada.";
      setTacticalUI();
    });
  }

  if (dom.clearTactical) {
    dom.clearTactical.addEventListener("click", () => {
      const viewer = dashboardState.viewer;
      if (!viewer) return;

      dashboardState.tacticalEntities.forEach(ent => viewer.entities.remove(ent));
      dashboardState.tacticalEntities = [];
      dashboardState.selectedEntity = null;

      updateSelectionInfo(dashboardState.selectedEntity);
      resetDrawingState();

      saveTacticalData();

      if (dom.tbHint) dom.tbHint.textContent = "Elementos tácticos limpiados.";
    });
  }

  if (dom.deleteSelectedBtn) {
    dom.deleteSelectedBtn.addEventListener("click", deleteSelectedEntity);
  }

  if (dom.entityPopupDelete) {
    dom.entityPopupDelete.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSelectedEntity();
    });
  }

  if (dom.clearSelectionBtn) {
    dom.clearSelectionBtn.addEventListener("click", () => {
      dashboardState.selectedEntity = null;
      updateSelectionInfo(dashboardState.selectedEntity);
      if (dom.entityPopup) dom.entityPopup.style.display = "none";
    });
  }

  if (dom.finishShape) {
    dom.finishShape.addEventListener("click", () => {
      if (dashboardState.areaDrawing) {
        finishPlanningAreaByPoints();
        return;
      }

      if (dashboardState.toolMode === "polygon") {
        finishPolygon();
        return;
      }

      if (dashboardState.toolMode === "polyline") {
        finishPolyline();
        return;
      }

      if (dashboardState.toolMode === "perimeter") {
        finishPerimeter();
      }
    });
  }
}
