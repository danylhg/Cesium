// js/dashboard/dashboard.dom.js

export const dom = {
  // Header / sesión
  who: document.getElementById("who"),
  logout: document.getElementById("logout"),

  // Herramientas tácticas
  toolSelect: document.getElementById("toolSelect"),
  iconPallet: document.getElementById("iconPallet"),
  iconScale: document.getElementById("iconScale"),
  iconSettings: document.getElementById("iconSettings"),
  symLabel: document.getElementById("symLabel"),
  placeBtn: document.getElementById("placeBtn"),
  finishShape: document.getElementById("finishShape"),
  cancelPlace: document.getElementById("cancelPlace"),
  clearTactical: document.getElementById("clearTactical"),
  tbHint: document.getElementById("tbHint"),
  colorSelect: document.getElementById("colorSelect"),
  opacityRange: document.getElementById("opacityRange"),
  widthRange: document.getElementById("widthRange"),
  radiusInput: document.getElementById("radiusInput"),
  radiusContainer: document.getElementById("radiusContainer"),

  // Chat
  chatPanel: document.getElementById("chatPanel"),
  toggleChatPanel: document.getElementById("toggleChatPanel"),
  chatTabCet: document.getElementById("chatTabCet"),
  chatTabCells: document.getElementById("chatTabCells"),
  chatMessages: document.getElementById("chatMessages"),
  chatInput: document.getElementById("chatInput"),
  sendChatBtn: document.getElementById("sendChatBtn"),

  // Panels
  infoPanel: document.getElementById("infoPanel"),
  routePanel: document.getElementById("routePanel"),
  tacticalPanel: document.getElementById("tacticalPanel"),

  toggleInfoPanel: document.getElementById("toggleInfoPanel"),
  toggleRoutePanel: document.getElementById("toggleRoutePanel"),
  toggleTacticalPanel: document.getElementById("toggleTacticalPanel"),

  // Área de planeación
  markAreaBtn: document.getElementById("markAreaBtn"),
  clearAreaBtn: document.getElementById("clearAreaBtn"),
  areaInfo: document.getElementById("areaInfo"),

  // Selección
  selectionInfo: document.getElementById("selectionInfo"),
  deleteSelectedBtn: document.getElementById("deleteSelectedBtn"),
  clearSelectionBtn: document.getElementById("clearSelectionBtn"),

  // Ruta
  routeInfo: document.getElementById("routeInfo"),
  routeVehicleSelect: document.getElementById("routeVehicleSelect"),
  opLat: document.getElementById("opLat"),
  opLng: document.getElementById("opLng"),

  // Mapa
  map: document.getElementById("map"),

  // Botones operación
  saveOpMapBtn: document.getElementById("saveOpMapBtn"),
  cancelOpMapBtn: document.getElementById("cancelOpMapBtn"),

  // Popup entidad
  entityPopup: document.getElementById("entityPopup"),
  entityPopupName: document.getElementById("entityPopupName"),
  entityPopupDelete: document.getElementById("entityPopupDelete")
};
