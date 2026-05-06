// js/dashboard/dashboard.drawing.js
// Freehand pencil drawing, eraser, and global undo/redo system

import { dashboardState } from "./dashboard.state.js";

import { cartesianToLatLng } from "./dashboard.persistence.js";
import { getCesiumColor, getCurrentColorName, getLineWidth } from "./dashboard.tactical.js";

/* ─── Backend helpers ────────────────────────────────────────── */

function getApiContext() {
  const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
  const token    = localStorage.getItem("token");
  const opId     = localStorage.getItem("active_operation_id");
  return { API_BASE, token, opId };
}

async function saveDrawingToBackend(coords, color, grosor) {
  const { API_BASE, token, opId } = getApiContext();
  if (!token || !opId) return null;

  const userData    = JSON.parse(localStorage.getItem("userData") || "{}");
  const tabla       = userData.tabla || "usuario";
  const tipo_creador = tabla === "personal" ? "PERSONAL" : "USUARIO";
  const idKey       = tabla === "personal" ? "id_personal" : "id_usuario";
  const idVal       = tabla === "personal" ? userData.id_personal : userData.id_usuario;

  try {
    const res = await fetch(`${API_BASE}/ops/${opId}/dibujos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ puntos: coords, color, grosor, tipo_creador, [idKey]: idVal })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? data.dibujo : null;
  } catch {
    return null;
  }
}

async function deleteDrawingFromBackend(id_dibujo) {
  const { API_BASE, token, opId } = getApiContext();
  if (!token || !opId || !id_dibujo) return;

  try {
    await fetch(`${API_BASE}/ops/${opId}/dibujos/${id_dibujo}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
  } catch {
    // fallo silencioso — la entidad ya fue removida visualmente
  }
}

// Map: cesium entity id → id_dibujo del backend
const _drawingBackendIds = new Map();

/* ─── Backend sync helpers for undo/redo ────────────────────── */

function getTacticalBackendIds(entityRef) {
  if (!entityRef?.properties) return null;
  const get = k => entityRef.properties[k]?.getValue?.() ?? entityRef.properties[k];
  const idPoi = get("id_poi");
  if (idPoi != null && !String(idPoi).startsWith("local_"))
    return { kind: "poi", id: Number(idPoi) };
  const idArea = get("id_area");
  if (idArea != null && !String(idArea).startsWith("local_"))
    return { kind: "area", id: Number(idArea) };
  const idMarca = get("id_marca");
  if (idMarca != null && !String(idMarca).startsWith("local_"))
    return { kind: "structure", id: Number(idMarca) };
  const idRuta = get("id_ruta");
  if (idRuta != null && !String(idRuta).startsWith("local_"))
    return { kind: "route", id: Number(idRuta) };
  return null;
}

const _kindToSeg = { poi: "pois", area: "areas", structure: "edificios", route: "rutas" };

async function deleteTacticalFromBackend(kind, id) {
  const { API_BASE, token, opId } = getApiContext();
  const seg = _kindToSeg[kind];
  if (!token || !opId || !seg) return;
  try {
    await fetch(`${API_BASE}/ops/${opId}/${seg}/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch { /* fire-and-forget */ }
}

async function restoreTacticalFromBackend(kind, id) {
  const { API_BASE, token, opId } = getApiContext();
  const seg = _kindToSeg[kind];
  if (!token || !opId || !seg) return;
  try {
    await fetch(`${API_BASE}/ops/${opId}/${seg}/${id}/restore`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch { /* fire-and-forget */ }
}

async function restoreDrawingInBackend(id_dibujo) {
  const { API_BASE, token, opId } = getApiContext();
  if (!token || !opId || !id_dibujo) return;
  try {
    await fetch(`${API_BASE}/ops/${opId}/dibujos/${id_dibujo}/restore`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch { /* fire-and-forget */ }
}

// Llamada fire-and-forget tras ejecutar undo visualmente.
function syncUndoToBackend(action) {
  if (action.type === "add") {
    if (action.source === "tactical" && action.entityRef) {
      const info = getTacticalBackendIds(action.entityRef);
      if (info) {
        action.backendInfo = info; // guardado para redo
        deleteTacticalFromBackend(info.kind, info.id);
      }
    } else if (action.source === "drawing" && action.entityRef) {
      const id_dibujo = _drawingBackendIds.get(action.entityRef.id);
      if (id_dibujo) {
        action.backendId = id_dibujo; // guardado para redo
        deleteDrawingFromBackend(id_dibujo);
        _drawingBackendIds.delete(action.entityRef.id);
      }
    }
  } else if (action.type === "remove") {
    if (action.source === "drawing" && action.backendId) {
      restoreDrawingInBackend(action.backendId).then(() => {
        if (action.entityRef) _drawingBackendIds.set(action.entityRef.id, action.backendId);
      });
    }
  }
}

// Llamada fire-and-forget tras ejecutar redo visualmente.
function syncRedoToBackend(action) {
  if (action.type === "add") {
    if (action.source === "tactical" && action.backendInfo) {
      restoreTacticalFromBackend(action.backendInfo.kind, action.backendInfo.id);
    } else if (action.source === "drawing" && action.backendId) {
      restoreDrawingInBackend(action.backendId).then(() => {
        if (action.entityRef) _drawingBackendIds.set(action.entityRef.id, action.backendId);
      });
    }
  } else if (action.type === "remove") {
    if (action.source === "drawing" && action.backendId) {
      deleteDrawingFromBackend(action.backendId);
      if (action.entityRef) _drawingBackendIds.delete(action.entityRef.id);
    }
    // Tactical "remove" no se pushea al stack — sin acción
  }
}

/* ─── Undo / Redo history (global — all map actions) ────────── */

const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 60;

export function pushUndoAction(action) {
  // action = { type: "add"|"remove", entityId, entityData?, entityRef?, source: "drawing"|"tactical" }
  undoStack.push(action);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0; // clear redo on new action
  refreshUndoRedoButtons();
}

export function undo() {
  if (undoStack.length === 0) return;
  const action = undoStack.pop();
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  if (action.type === "add") {
    // Undo an add → hide the entity
    const ent = action.entityRef || viewer.entities.getById(action.entityId);
    if (ent) {
      syncUndoToBackend(action);
      ent.show = false;
      action.entityRef = ent;

      // Remove from appropriate list
      if (action.source === "tactical") {
        dashboardState.tacticalEntities = (dashboardState.tacticalEntities || [])
          .filter(e => e !== ent);
      } else {
        dashboardState.drawingEntities = (dashboardState.drawingEntities || [])
          .filter(e => e !== ent);
      }
    }
    redoStack.push(action);
  } else if (action.type === "remove") {
    // Undo a remove → show the entity again or rebuild
    if (action.entityRef && viewer.entities.contains(action.entityRef)) {
      action.entityRef.show = true;
    } else if (action.entityData) {
      const ent = rebuildDrawingEntity(action.entityData);
      if (ent) action.entityRef = ent;
    }

    syncUndoToBackend(action);

    // Re-add to appropriate list
    if (action.entityRef) {
      if (action.source === "tactical") {
        dashboardState.tacticalEntities = dashboardState.tacticalEntities || [];
        if (!dashboardState.tacticalEntities.includes(action.entityRef)) {
          dashboardState.tacticalEntities.push(action.entityRef);
        }
      } else {
        dashboardState.drawingEntities = dashboardState.drawingEntities || [];
        if (!dashboardState.drawingEntities.includes(action.entityRef)) {
          dashboardState.drawingEntities.push(action.entityRef);
        }
      }
    }
    redoStack.push(action);
  }
  refreshUndoRedoButtons();
}

export function redo() {
  if (redoStack.length === 0) return;
  const action = redoStack.pop();
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  if (action.type === "add") {
    // Redo an add → show the entity again or rebuild
    if (action.entityRef && viewer.entities.contains(action.entityRef)) {
      action.entityRef.show = true;
    } else if (action.entityData) {
      const ent = rebuildDrawingEntity(action.entityData);
      if (ent) action.entityRef = ent;
    }

    syncRedoToBackend(action);

    if (action.entityRef) {
      if (action.source === "tactical") {
        dashboardState.tacticalEntities = dashboardState.tacticalEntities || [];
        if (!dashboardState.tacticalEntities.includes(action.entityRef)) {
          dashboardState.tacticalEntities.push(action.entityRef);
        }
      } else {
        dashboardState.drawingEntities = dashboardState.drawingEntities || [];
        if (!dashboardState.drawingEntities.includes(action.entityRef)) {
          dashboardState.drawingEntities.push(action.entityRef);
        }
      }
    }
    undoStack.push(action);
  } else if (action.type === "remove") {
    // Redo a remove → hide the entity again
    const ent = action.entityRef || viewer.entities.getById(action.entityId);
    if (ent) {
      syncRedoToBackend(action);
      ent.show = false;
      action.entityRef = ent;

      if (action.source === "tactical") {
        dashboardState.tacticalEntities = (dashboardState.tacticalEntities || [])
          .filter(e => e !== ent);
      } else {
        dashboardState.drawingEntities = (dashboardState.drawingEntities || [])
          .filter(e => e !== ent);
      }
    }
    undoStack.push(action);
  }
  refreshUndoRedoButtons();
}

function refreshUndoRedoButtons() {
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

/* ─── Serialize / Rebuild helpers ───────────────────────────── */

let _drawIdCounter = 0;

function serializePolyline(entity) {
  if (!entity?.polyline) return null;
  const positions = entity.polyline.positions?.getValue?.(Cesium.JulianDate.now())
    ?? entity.polyline.positions;
  if (!positions || !positions.length) return null;

  const coords = positions.map(c => {
    const carto = Cesium.Cartographic.fromCartesian(c);
    return {
      lng: Cesium.Math.toDegrees(carto.longitude),
      lat: Cesium.Math.toDegrees(carto.latitude)
    };
  });

  const color = entity.polyline.material?.color?.getValue?.(Cesium.JulianDate.now())
    ?? entity.polyline.material?.color
    ?? Cesium.Color.WHITE;
  const width = entity.polyline.width?.getValue?.(Cesium.JulianDate.now())
    ?? entity.polyline.width
    ?? 3;

  return {
    id: entity.id,
    coords,
    color: color.toCssColorString(),
    width
  };
}

function rebuildDrawingEntity(data) {
  const viewer = dashboardState.viewer;
  if (!viewer || !data || !data.coords || data.coords.length < 2) return null;

  const positions = data.coords.map(c => Cesium.Cartesian3.fromDegrees(c.lng, c.lat));
  const color = Cesium.Color.fromCssColorString(data.color || "#FFFFFF");

  return viewer.entities.add({
    id: data.id || `draw_${++_drawIdCounter}_${Date.now()}`,
    polyline: {
      positions,
      width: data.width || 3,
      material: color,
      clampToGround: true
    },
    properties: {
      tacticalType: "freehand-drawing",
      draggable: false
    }
  });
}

/* ─── Pencil (freehand drawing) ─────────────────────────────── */

let _isDrawing = false;
let _currentDrawCoords = [];
let _currentPreviewEntity = null;
let _pencilHandler = null;

export function startPencilMode() {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  dashboardState.drawingMode = "pencil";
  stopEraserMode();

  if (_pencilHandler) _pencilHandler.destroy();
  _pencilHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  // Disable map rotation while drawing
  _pencilHandler.setInputAction((click) => {
    _isDrawing = true;
    _currentDrawCoords = [];
    viewer.scene.screenSpaceCameraController.enableRotate = false;
    viewer.scene.screenSpaceCameraController.enableTranslate = false;
    viewer.scene.screenSpaceCameraController.enableZoom = false;

    const cartesian = viewer.camera.pickEllipsoid(
      click.position, viewer.scene.globe.ellipsoid
    );
    if (cartesian) {
      const pos = cartesianToLatLng(cartesian);
      _currentDrawCoords.push(pos);
    }

    const colorName = getCurrentColorName();
    const cesiumColor = getCesiumColor(colorName, 1);
    _currentPreviewEntity = viewer.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          if (_currentDrawCoords.length < 2) return [];
          return _currentDrawCoords.map(c =>
            Cesium.Cartesian3.fromDegrees(c.lng, c.lat)
          );
        }, false),
        width: getLineWidth(),
        material: cesiumColor,
        clampToGround: true
      },
      properties: {
        tacticalType: "freehand-drawing-preview",
        draggable: false
      }
    });
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  _pencilHandler.setInputAction((movement) => {
    if (!_isDrawing) return;

    const cartesian = viewer.camera.pickEllipsoid(
      movement.endPosition, viewer.scene.globe.ellipsoid
    );
    if (!cartesian) return;

    const pos = cartesianToLatLng(cartesian);
    _currentDrawCoords.push(pos);

    viewer.scene.requestRender?.();
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  _pencilHandler.setInputAction(() => {
    if (!_isDrawing) return;
    _isDrawing = false;

    viewer.scene.screenSpaceCameraController.enableRotate = true;
    viewer.scene.screenSpaceCameraController.enableTranslate = true;
    viewer.scene.screenSpaceCameraController.enableZoom = true;

    // Remove preview
    if (_currentPreviewEntity) {
      viewer.entities.remove(_currentPreviewEntity);
      _currentPreviewEntity = null;
    }

    // Finalize if we have enough points
    if (_currentDrawCoords.length >= 2) {
      const colorName = getCurrentColorName();
      const cesiumColor = getCesiumColor(colorName, 1);
      const width = getLineWidth();
      const colorCss = cesiumColor.toCssColorString();

      const entityId = `draw_${++_drawIdCounter}_${Date.now()}`;
      const data = {
        id: entityId,
        coords: [..._currentDrawCoords],
        color: colorCss,
        width
      };

      const ent = rebuildDrawingEntity(data);
      if (ent) {
        dashboardState.drawingEntities = dashboardState.drawingEntities || [];
        dashboardState.drawingEntities.push(ent);

        pushUndoAction({
          type: "add",
          entityId: ent.id,
          entityRef: ent,
          entityData: data,
          source: "drawing"
        });

        // Guardar en backend y registrar el id_dibujo devuelto.
        // Si el usuario hizo undo antes de que la respuesta llegara,
        // la entidad ya no está visible → borramos del backend en lugar de registrar.
        saveDrawingToBackend(data.coords, colorCss, width).then(dibujo => {
          if (dibujo?.id_dibujo) {
            if (ent.show === false) {
              deleteDrawingFromBackend(dibujo.id_dibujo);
            } else {
              _drawingBackendIds.set(ent.id, dibujo.id_dibujo);
            }
          }
        });
      }
    }

    _currentDrawCoords = [];
  }, Cesium.ScreenSpaceEventType.LEFT_UP);


}

export function stopPencilMode() {
  if (_pencilHandler) {
    _pencilHandler.destroy();
    _pencilHandler = null;
  }
  _isDrawing = false;
  _currentDrawCoords = [];

  const viewer = dashboardState.viewer;
  if (viewer) {
    if (_currentPreviewEntity) {
      viewer.entities.remove(_currentPreviewEntity);
      _currentPreviewEntity = null;
    }
    viewer.scene.screenSpaceCameraController.enableRotate = true;
    viewer.scene.screenSpaceCameraController.enableTranslate = true;
    viewer.scene.screenSpaceCameraController.enableZoom = true;
  }

  if (dashboardState.drawingMode === "pencil") {
    dashboardState.drawingMode = null;
  }
}

/* ─── Eraser mode ───────────────────────────────────────────── */

let _eraserHandler = null;

export function startEraserMode() {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  dashboardState.drawingMode = "eraser";
  stopPencilMode();

  if (_eraserHandler) _eraserHandler.destroy();
  _eraserHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  _eraserHandler.setInputAction((click) => {
    const picked = viewer.scene.pick(click.position);
    if (!picked || !picked.id) return;

    const entity = picked.id;
    const tacticalType =
      entity.properties?.tacticalType?.getValue?.() ??
      entity.properties?.tacticalType ?? "";

    if (tacticalType === "freehand-drawing") {
      // Serialize before removing (for undo)
      const data = serializePolyline(entity);

      // Borrar del backend si tenemos el id_dibujo
      const id_dibujo = _drawingBackendIds.get(entity.id);
      if (id_dibujo) {
        deleteDrawingFromBackend(id_dibujo);
        _drawingBackendIds.delete(entity.id);
      }

      viewer.entities.remove(entity);
      dashboardState.drawingEntities = (dashboardState.drawingEntities || [])
        .filter(e => e !== entity);

      if (data) {
        pushUndoAction({
          type: "remove",
          entityId: data.id,
          entityRef: entity,
          entityData: data,
          source: "drawing",
          backendId: id_dibujo ?? null
        });
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);


}

export function stopEraserMode() {
  if (_eraserHandler) {
    _eraserHandler.destroy();
    _eraserHandler = null;
  }
  if (dashboardState.drawingMode === "eraser") {
    dashboardState.drawingMode = null;
  }
}

/* ─── Cleanup ─────────────────────────────────────────────────  */

export function stopAllDrawingModes() {
  stopPencilMode();
  stopEraserMode();
}

/* ─── Load from backend ───────────────────────────────────────  */

export async function loadDrawingsFromBackend() {
  const { API_BASE, token, opId } = getApiContext();
  if (!token || !opId) return;

  try {
    const res = await fetch(`${API_BASE}/ops/${opId}/dibujos`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.items)) return;

    const viewer = dashboardState.viewer;
    if (!viewer) return;

    data.items.forEach(item => {
      if (!Array.isArray(item.puntos) || item.puntos.length < 2) return;

      const ent = rebuildDrawingEntity({
        coords: item.puntos,
        color:  item.color  || "#FFFFFF",
        width:  item.grosor || 3
      });

      if (ent) {
        dashboardState.drawingEntities = dashboardState.drawingEntities || [];
        dashboardState.drawingEntities.push(ent);
        _drawingBackendIds.set(ent.id, item.id_dibujo);
      }
    });
  } catch (err) {
    console.warn("[DRAWING] Error cargando dibujos:", err.message);
  }
}

/* ─── Socket listeners ────────────────────────────────────────  */

export function initDrawingSocket(socket) {
  socket.on("dibujo_creado", ({ dibujo }) => {
    if (!dibujo?.id_dibujo) return;
    // Ignorar eco: si yo ya tengo ese id_dibujo mapeado, no lo redibujamos
    if ([..._drawingBackendIds.values()].includes(dibujo.id_dibujo)) return;

    const viewer = dashboardState.viewer;
    if (!viewer) return;

    const puntos = dibujo.puntos;
    if (!Array.isArray(puntos) || puntos.length < 2) return;

    const ent = rebuildDrawingEntity({
      coords: puntos,
      color:  dibujo.color  || "#FFFFFF",
      width:  dibujo.grosor || 3
    });

    if (ent) {
      dashboardState.drawingEntities = dashboardState.drawingEntities || [];
      dashboardState.drawingEntities.push(ent);
      _drawingBackendIds.set(ent.id, dibujo.id_dibujo);
    }
  });

  socket.on("dibujo_eliminado", ({ id_dibujo }) => {
    if (!id_dibujo) return;
    const viewer = dashboardState.viewer;
    if (!viewer) return;

    // Buscar la entidad local que corresponde a este id_dibujo
    for (const [entityId, backendId] of _drawingBackendIds.entries()) {
      if (backendId === id_dibujo) {
        const ent = viewer.entities.getById(entityId);
        if (ent) {
          viewer.entities.remove(ent);
          dashboardState.drawingEntities = (dashboardState.drawingEntities || [])
            .filter(e => e !== ent);
        }
        _drawingBackendIds.delete(entityId);
        break;
      }
    }
  });
}

/* ─── Bind events ─────────────────────────────────────────────  */

export function bindDrawingEvents() {
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");

  if (undoBtn) {
    undoBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      undo();
    });
  }

  if (redoBtn) {
    redoBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      redo();
    });
  }

  // Keyboard shortcuts: Ctrl+Z (undo), Ctrl+Y / Ctrl+Shift+Z (redo)
  document.addEventListener("keydown", (e) => {
    // Don't intercept when typing in inputs
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
      e.preventDefault();
      undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "Z"))) {
      e.preventDefault();
      redo();
    }
  });

  refreshUndoRedoButtons();
}

export async function clearAllDrawings() {
  const viewer = dashboardState.viewer;
  if (!viewer) return [];

  const entities = dashboardState.drawingEntities || [];
  const failures = [];

  for (const entity of [...entities]) {
    const id_dibujo = _drawingBackendIds.get(entity.id);
    if (id_dibujo) {
      try {
        await deleteDrawingFromBackend(id_dibujo);
        _drawingBackendIds.delete(entity.id);
      } catch (err) {
        failures.push(`Dibujo ${id_dibujo}`);
        continue;
      }
    }
    viewer.entities.remove(entity);
  }

  dashboardState.drawingEntities = (dashboardState.drawingEntities || [])
    .filter(entity => viewer.entities.contains(entity));

  return failures;
}
