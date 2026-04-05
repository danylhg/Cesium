// js/dashboard/dashboard.tactical.js

import { dashboardState } from "./dashboard.state.js";
import { dom } from "./dashboard.dom.js";
import { setRouteInfo, updateSelectionInfo } from "./dashboard.ui.js";
import { getCurrentOperation } from "./dashboard.storage.js";
import { clearPlanningArea, finishPlanningAreaByPoints } from "./dashboard.area.js";
import { saveTacticalData } from "./dashboard.persistence.js";

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
  const isMil = dashboardState.toolMode === "mil";
  const needsLabel = ["mil", "poi", "label", "circle", "polygon", "polyline", "perimeter", "building"].includes(dashboardState.toolMode);
  const needsRadius = dashboardState.toolMode === "circle";
  const isMultiPoint = ["polygon", "polyline", "perimeter"].includes(dashboardState.toolMode);

  const milTitle = document.getElementById("milSymbolTitle");
  if (milTitle) milTitle.style.display = isMil ? "block" : "none";

  if (dom.iconPallet) dom.iconPallet.style.display = isMil ? "flex" : "none";
  if (dom.iconSettings) dom.iconSettings.style.display = isMil ? "block" : "none";

  if (dom.symLabel) dom.symLabel.disabled = !needsLabel;
  if (dom.radiusInput) dom.radiusInput.disabled = !needsRadius;
  if (dom.radiusContainer) {
    dom.radiusContainer.style.display = needsRadius ? "block" : "none";
  }

  if (dom.placeBtn) dom.placeBtn.disabled = dashboardState.toolMode === "none" || isMil;
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

export function createPoi(lat, lng, iconPath = null) {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  const label = getCurrentLabel() || (dashboardState.toolMode === "building" ? "Edificio" : "Punto de interés");
  const color = getCesiumColor(getCurrentColorName(), 1);

  const ent = viewer.entities.add({
    name: label,
    position: Cesium.Cartesian3.fromDegrees(lng, lat),
    billboard: iconPath ? {
      image: iconPath,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      scale: 0.08
    } : undefined,
    point: !iconPath ? {
      pixelSize: 10,
      color,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    } : undefined,
    label: {
      text: label,
      font: "14px sans-serif",
      pixelOffset: iconPath ? new Cesium.Cartesian2(0, 15) : new Cesium.Cartesian2(0, -20),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    },
    properties: {
      tacticalType: dashboardState.toolMode,
      draggable: true
    }
  });

  addTacticalEntity(ent);
  if (dom.tbHint) dom.tbHint.textContent = `${label} colocado.`;
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
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
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
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
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
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
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
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
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
