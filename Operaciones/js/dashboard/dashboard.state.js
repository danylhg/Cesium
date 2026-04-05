// js/dashboard/dashboard.state.js

export const dashboardState = {
  viewer: null,

  pickMode: null,
  startPoint: null,
  endPoint: null,
  lastRoute: null,

  startEntity: null,
  endEntity: null,
  routeEntity: null,

  areaMode: false,
  areaDrawing: false,
  areaPoints: [],
  areaVertexEntities: [],
  areaPreviewLine: null,
  planningAreaFill: null,
  planningAreaBorder: null,
  planningAreaLabel: null,

  selectedEntity: null,
  draggingEntity: null,
  isDragging: false,

  tacticalEntities: [],
  placingMode: false,
  toolMode: "none",
  drawingPoints: [],
  drawingVertexEntities: [],
  tacticalPreviewLine: null,
  tacticalPreviewFill: null,

  currentChatChannel: "cet",
  mediaRecorder: null,
  audioChunks: []
};