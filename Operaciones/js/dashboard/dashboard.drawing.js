// js/dashboard/dashboard.drawing.js
// Freehand pencil drawing, eraser, and global undo/redo system

import { dashboardState } from "./dashboard.state.js";
import { dom } from "./dashboard.dom.js";
import { cartesianToLatLng } from "./dashboard.persistence.js";
import { getCesiumColor, getCurrentColorName, getLineWidth } from "./dashboard.tactical.js";

/* ─── Undo / Redo history ───────────────────────────────────── */

const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 60;

function pushUndoAction(action) {
  // action = { type: "add"|"remove", entityId, entityData?, entityRef? }
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
    // Undo an add → remove the entity
    const ent = viewer.entities.getById(action.entityId);
    if (ent) {
      viewer.entities.remove(ent);
      // Also remove from drawingEntities
      dashboardState.drawingEntities = (dashboardState.drawingEntities || [])
        .filter(e => e !== ent);
    }
    redoStack.push({ ...action, _removedData: action.entityData });
  } else if (action.type === "remove") {
    // Undo a remove → re-add the entity
    const ent = rebuildDrawingEntity(action.entityData);
    if (ent) {
      dashboardState.drawingEntities = dashboardState.drawingEntities || [];
      dashboardState.drawingEntities.push(ent);
    }
    redoStack.push({ ...action, entityId: ent?.id ?? action.entityId });
  }
  refreshUndoRedoButtons();
}

export function redo() {
  if (redoStack.length === 0) return;
  const action = redoStack.pop();
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  if (action.type === "add") {
    // Redo an add → re-add the entity
    const ent = rebuildDrawingEntity(action.entityData);
    if (ent) {
      dashboardState.drawingEntities = dashboardState.drawingEntities || [];
      dashboardState.drawingEntities.push(ent);
    }
    action.entityId = ent?.id ?? action.entityId;
    undoStack.push(action);
  } else if (action.type === "remove") {
    // Redo a remove → remove the entity again
    const ent = viewer.entities.getById(action.entityId);
    if (ent) {
      viewer.entities.remove(ent);
      dashboardState.drawingEntities = (dashboardState.drawingEntities || [])
        .filter(e => e !== ent);
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
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  _pencilHandler.setInputAction((movement) => {
    if (!_isDrawing) return;

    const cartesian = viewer.camera.pickEllipsoid(
      movement.endPosition, viewer.scene.globe.ellipsoid
    );
    if (!cartesian) return;

    const pos = cartesianToLatLng(cartesian);
    _currentDrawCoords.push(pos);

    // Update live preview
    if (_currentDrawCoords.length >= 2) {
      if (_currentPreviewEntity) viewer.entities.remove(_currentPreviewEntity);

      const positions = _currentDrawCoords.map(c =>
        Cesium.Cartesian3.fromDegrees(c.lng, c.lat)
      );

      const colorName = getCurrentColorName();
      const cesiumColor = getCesiumColor(colorName, 1);

      _currentPreviewEntity = viewer.entities.add({
        polyline: {
          positions,
          width: getLineWidth(),
          material: cesiumColor,
          clampToGround: true
        }
      });
    }
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

      const entityId = `draw_${++_drawIdCounter}_${Date.now()}`;
      const data = {
        id: entityId,
        coords: [..._currentDrawCoords],
        color: cesiumColor.toCssColorString(),
        width
      };

      const ent = rebuildDrawingEntity(data);
      if (ent) {
        dashboardState.drawingEntities = dashboardState.drawingEntities || [];
        dashboardState.drawingEntities.push(ent);

        pushUndoAction({
          type: "add",
          entityId: ent.id,
          entityData: data
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

      viewer.entities.remove(entity);
      dashboardState.drawingEntities = (dashboardState.drawingEntities || [])
        .filter(e => e !== entity);

      if (data) {
        pushUndoAction({
          type: "remove",
          entityId: data.id,
          entityData: data
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
