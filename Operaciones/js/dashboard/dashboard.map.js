// js/dashboard/dashboard.map.js

import { dashboardState } from "./dashboard.state.js";
import { dom } from "./dashboard.dom.js";
import { updateSelectionInfo, setRouteInfo } from "./dashboard.ui.js";
import {
  handleTacticalPlacement,
  updateTacticalPreview,
  isDraggableEntity,
  createMilSymbol
} from "./dashboard.tactical.js";
import { addAreaVertex, updateAreaPreview } from "./dashboard.area.js";
import { cartesianToLatLng } from "./dashboard.persistence.js";
import {
  persistRouteDataToCurrentOperation,
  autoCalcRoute,
  loadRouteForSelectedVehicle,
  clearRoute,
  applyRouteFilter,
  selectRemoteRoute,
  getRouteIdForEntity
} from "./dashboard.routes.js";

const providers = {
  osm: new Cesium.OpenStreetMapImageryProvider({
    url: "https://a.tile.openstreetmap.org/"
  }),
  satellite: new Cesium.UrlTemplateImageryProvider({
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    credit: "Esri World Imagery"
  })
};

export class OpenStreetMapNominatimGeocoder {
  constructor() {
    this._credit = undefined;
  }

  get credit() {
    return this._credit;
  }

  async geocode(input) {
    const query = String(input || "").trim();
    if (!query) return [];

    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=5`;

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) return [];

      const results = await response.json();

      return results.map((item) => {
        const south = parseFloat(item.boundingbox[0]);
        const north = parseFloat(item.boundingbox[1]);
        const west = parseFloat(item.boundingbox[2]);
        const east = parseFloat(item.boundingbox[3]);

        return {
          displayName: item.display_name,
          destination: Cesium.Rectangle.fromDegrees(west, south, east, north)
        };
      });
    } catch {
      return [];
    }
  }
}

export function getMapClickPosition(screenPosition) {
  const viewer = dashboardState.viewer;
  if (!viewer) return null;

  const scene = viewer.scene;
  let cartesian = null;

  if (scene.pickPositionSupported) {
    cartesian = scene.pickPosition(screenPosition);
  }

  if (!cartesian) {
    cartesian = viewer.camera.pickEllipsoid(screenPosition, scene.globe.ellipsoid);
  }

  return cartesian;
}

export function setBaseLayer(key) {
  const viewer = dashboardState.viewer;
  const provider = providers[key];
  if (!viewer || !provider) return;

  viewer.imageryLayers.removeAll();
  viewer.imageryLayers.addImageryProvider(provider);
}

function handleEntitySelection(clickPosition) {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  const picked = viewer.scene.pick(clickPosition);

  if (picked && picked.id) {
    // Detectar si se clickeó una entidad de ruta remota
    const routeId = getRouteIdForEntity(picked.id);
    if (routeId) {
      selectRemoteRoute(routeId);
      return;
    }

    dashboardState.selectedEntity = picked.id;
    updateSelectionInfo(dashboardState.selectedEntity);

    const tacticalType =
      dashboardState.selectedEntity.properties?.tacticalType?.getValue?.() ||
      dashboardState.selectedEntity.properties?.tacticalType;

    const isTactical =
      tacticalType &&
      !["planning-area", "planning-area-border", "planning-area-label"].includes(tacticalType);

    if (dom.entityPopup && isTactical) {
      const name = dashboardState.selectedEntity.name || tacticalType || "Elemento táctico";
      if (dom.entityPopupName) {
        dom.entityPopupName.textContent = name;
      }

      const rect = viewer.canvas.getBoundingClientRect();
      const x = clickPosition.x + rect.left + 15;
      const y = clickPosition.y + rect.top - 20;

      dom.entityPopup.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
      dom.entityPopup.style.top = `${Math.max(y - 70, rect.top + 10)}px`;
      dom.entityPopup.style.display = "block";
    } else if (dom.entityPopup) {
      dom.entityPopup.style.display = "none";
    }

    if (
      dashboardState.selectedEntity.properties?.tacticalType?.getValue?.() === "mil-dropped" &&
      dom.iconScale
    ) {
      const currentScale =
        dashboardState.selectedEntity.billboard?.scale?.getValue?.() ||
        dashboardState.selectedEntity.billboard?.scale ||
        0.08;
      dom.iconScale.value = currentScale;
    }
  } else {
    dashboardState.selectedEntity = null;
    updateSelectionInfo(null);
    if (dom.entityPopup) dom.entityPopup.style.display = "none";
  }
}

function handleAreaClick(lat, lng) {
  dashboardState.areaPoints.push({ lat, lng });
  addAreaVertex(lat, lng, dashboardState.areaPoints.length - 1);

  if (dom.areaInfo) {
    dom.areaInfo.textContent =
      `Punto ${dashboardState.areaPoints.length} agregado. Sigue marcando o presiona "Terminar figura".`;
  }
}

function handleRoutePick(lat, lng) {
  const viewer = dashboardState.viewer;
  if (!viewer) return false;

  if (dashboardState.pickMode === "start") {
    dashboardState.startPoint = { lat, lng };
    dashboardState.lastRoute = null;

    if (dom.opLat) dom.opLat.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    if (dashboardState.routeEntity) {
      viewer.entities.remove(dashboardState.routeEntity);
      dashboardState.routeEntity = null;
    }

    if (dashboardState.startEntity) viewer.entities.remove(dashboardState.startEntity);

    dashboardState.startEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lng, lat),
      point: { pixelSize: 12, color: Cesium.Color.LIME },
      label: {
        text: "ORIGEN",
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        pixelOffset: new Cesium.Cartesian2(0, -24)
      }
    });

    dashboardState.pickMode = null;

    persistRouteDataToCurrentOperation();

    setRouteInfo("Origen seleccionado. Ahora elige destino.");

    if (dashboardState.startPoint && dashboardState.endPoint) {
      autoCalcRoute();
    }
    return true;
  }

  if (dashboardState.pickMode === "end") {
    dashboardState.endPoint = { lat, lng };
    dashboardState.lastRoute = null;

    if (dom.opLng) dom.opLng.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    if (dashboardState.routeEntity) {
      viewer.entities.remove(dashboardState.routeEntity);
      dashboardState.routeEntity = null;
    }

    if (dashboardState.endEntity) viewer.entities.remove(dashboardState.endEntity);

    dashboardState.endEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lng, lat),
      point: { pixelSize: 12, color: Cesium.Color.YELLOW },
      label: {
        text: "DESTINO",
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        pixelOffset: new Cesium.Cartesian2(0, -24)
      }
    });

    dashboardState.pickMode = null;

    persistRouteDataToCurrentOperation();

    setRouteInfo("Destino seleccionado. Ya puedes calcular ruta.");

    if (dashboardState.startPoint && dashboardState.endPoint) {
      autoCalcRoute();
    }
    return true;
  }

  return false;
}

function bindCesiumPointerEvents(handler) {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  handler.setInputAction((click) => {
    const cartesian = getMapClickPosition(click.position);

    handleEntitySelection(click.position);

    if (!cartesian) return;

    const pos = cartesianToLatLng(cartesian);
    const lat = pos.lat;
    const lng = pos.lng;

    if (dashboardState.areaDrawing) {
      handleAreaClick(lat, lng);
      return;
    }

    if (handleTacticalPlacement(lat, lng)) return;
    handleRoutePick(lat, lng);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  handler.setInputAction((click) => {
    const picked = viewer.scene.pick(click.position);
    if (!picked || !picked.id) return;

    if (isDraggableEntity(picked.id)) {
      dashboardState.draggingEntity = picked.id;
      dashboardState.selectedEntity = picked.id;
      dashboardState.isDragging = true;
      updateSelectionInfo(dashboardState.selectedEntity);
      viewer.scene.screenSpaceCameraController.enableRotate = false;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  handler.setInputAction((movement) => {
    if (!dashboardState.isDragging && dashboardState.areaDrawing) {
      const cartesian = getMapClickPosition(movement.endPosition);
      if (cartesian) {
        const pos = cartesianToLatLng(cartesian);
        updateAreaPreview(pos.lat, pos.lng);
      }
    }

    if (
      !dashboardState.isDragging &&
      dashboardState.placingMode &&
      ["polygon", "polyline", "perimeter"].includes(dashboardState.toolMode)
    ) {
      const cartesian = getMapClickPosition(movement.endPosition);
      if (cartesian) {
        const pos = cartesianToLatLng(cartesian);
        updateTacticalPreview(pos.lat, pos.lng);
      }
    }

    if (!dashboardState.isDragging || !dashboardState.draggingEntity) return;

    const cartesian = getMapClickPosition(movement.endPosition);
    if (!cartesian) return;

    dashboardState.draggingEntity.position = cartesian;
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction(() => {
    dashboardState.isDragging = false;
    dashboardState.draggingEntity = null;
    viewer.scene.screenSpaceCameraController.enableRotate = true;
  }, Cesium.ScreenSpaceEventType.LEFT_UP);
}

function bindMapDropEvents() {
  const viewer = dashboardState.viewer;
  if (!viewer || !dom.map) return;

  dom.map.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  dom.map.addEventListener("drop", (e) => {
    e.preventDefault();

    const src = e.dataTransfer.getData("text/plain");
    const title = e.dataTransfer.getData("application/title");
    if (!src || !title) return;

    const rect = dom.map.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cartesian = getMapClickPosition(new Cesium.Cartesian2(x, y));
    if (!cartesian) return;
    const coords = cartesianToLatLng(cartesian);
    if (!coords) return;

    createMilSymbol(
      coords.lat,
      coords.lng,
      title,
      src,
      Number(dom.iconScale ? dom.iconScale.value : 0.08)
    );
  });

  document.querySelectorAll(".iconItem").forEach(item => {
    item.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", item.dataset.src);
      e.dataTransfer.setData("application/title", item.dataset.title);
      e.dataTransfer.effectAllowed = "copy";
    });
  });
}

function bindMapUiEvents() {
  if (dom.routeVehicleSelect) {
    dom.routeVehicleSelect.addEventListener("change", (e) => {
      loadRouteForSelectedVehicle();
      applyRouteFilter(e.target.value);
    });
  }

  const setStartBtn = document.getElementById("setStart");
  if (setStartBtn) {
    setStartBtn.onclick = () => {
      dashboardState.areaMode = false;
      dashboardState.areaDrawing = false;
      if (dom.markAreaBtn) dom.markAreaBtn.textContent = "Marcar área";
      dashboardState.pickMode = "start";
      setRouteInfo("Modo origen activo: haz clic en el mapa.");
      dom.routePanel?.classList.add("open");
      dom.toggleRoutePanel?.classList.add("active");
    };
  }

  const setEndBtn = document.getElementById("setEnd");
  if (setEndBtn) {
    setEndBtn.onclick = () => {
      dashboardState.areaMode = false;
      dashboardState.areaDrawing = false;
      if (dom.markAreaBtn) dom.markAreaBtn.textContent = "Marcar área";
      dashboardState.pickMode = "end";
      setRouteInfo("Modo destino activo: haz clic en el mapa.");
      dom.routePanel?.classList.add("open");
      dom.toggleRoutePanel?.classList.add("active");
    };
  }

  // ============================================================
  // BACKEND: "Limpiar ruta" borra ruta de localStorage hoy.
  // Con backend: se necesita el id_ruta devuelto al guardarla.
  //   DELETE /ops/:id/rutas/:id_ruta
  // O bien PATCH para marcarla inactiva:
  //   PATCH /ops/:id/rutas/:id_ruta  { estado: "CANCELADA" }
  // ============================================================
  const clearRouteBtn = document.getElementById("clearRoute");
  if (clearRouteBtn) {
    clearRouteBtn.onclick = () => {
      dashboardState.pickMode = null;
      clearRoute(); // elimina de DB + limpia mapa
    };
  }

  const layerSelect = document.getElementById("layerSelect");
  if (layerSelect) {
    layerSelect.addEventListener("change", (e) => {
      setBaseLayer(e.target.value);
    });
  }

}

export function initCesium() {
  const viewer = new Cesium.Viewer("map", {
    timeline: false,
    animation: false,
    geocoder: [new OpenStreetMapNominatimGeocoder()],
    baseLayerPicker: false,
    sceneModePicker: false,
    navigationHelpButton: true,
    homeButton: true,
    fullscreenButton: false,
    selectionIndicator: false,
    infoBox: false
  });

  dashboardState.viewer = viewer;

  viewer.geocoder.viewModel.destinationFound = function (_viewModel, destination) {
    viewer.camera.flyTo({ destination });
  };

  setBaseLayer("osm");

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(-99.1332, 19.4326, 2500000)
  });

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  bindCesiumPointerEvents(handler);
  bindMapDropEvents();
  bindMapUiEvents();
}
