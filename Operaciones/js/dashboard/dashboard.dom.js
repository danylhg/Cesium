// js/dashboard/dashboard.dom.js
// js/dashboard/dashboard.dom.js

export const dom = {
  // Header / sesión
  who: document.getElementById("who"),
  logout: document.getElementById("logout"),

  // Herramientas tácticas
  toolSelect: document.getElementById("toolSelect"),
  pencilSubmenu: document.getElementById("pencilSubmenu"),
  btnSelectPencil: document.getElementById("btnSelectPencil"),
  btnSelectEraser: document.getElementById("btnSelectEraser"),
  milSymbolGenerator: document.getElementById("milSymbolGenerator"),
  milIdentity: document.getElementById("milIdentity"),
  milDimension: document.getElementById("milDimension"),
  milIcon: document.getElementById("milIcon"),
  milPreviewContainer: document.getElementById("milPreviewContainer"),
  iconPallet: document.getElementById("iconPallet"),
  symLabelContainer: document.getElementById("symLabelContainer"),
  symLabel: document.getElementById("symLabel"),
  placeBtn: document.getElementById("placeBtn"),
  finishShape: document.getElementById("finishShape"),
  cancelPlace: document.getElementById("cancelPlace"),
  tacticalActionButtons: document.getElementById("tacticalActionButtons"),
  clearTactical: document.getElementById("clearTactical"),
  colorContainer: document.getElementById("colorContainer"),
  colorSelect: document.getElementById("colorSelect"),
  opacityContainer: document.getElementById("opacityContainer"),
  opacityRange: document.getElementById("opacityRange"),
  widthContainer: document.getElementById("widthContainer"),
  widthRange: document.getElementById("widthRange"),
  radiusInput: document.getElementById("radiusInput"),
  radiusContainer: document.getElementById("radiusContainer"),

  // Chat
  chatPanel: document.getElementById("chatPanel"),
  toggleChatPanel: document.getElementById("toggleChatPanel"),
  chatTabCet: document.getElementById("chatTabCet"),
  chatTabCells: document.getElementById("chatTabCells"),
  chatChannelType: document.getElementById("chatChannelType"),
  chatChannelTarget: document.getElementById("chatChannelTarget"),
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
  recenterMapBtn: document.getElementById("recenterMapBtn"),

  // Popup entidad
  entityPopup: document.getElementById("entityPopup"),
  entityPopupName: document.getElementById("entityPopupName"),
  entityPopupDelete: document.getElementById("entityPopupDelete"),
  btnCloseEntityPopup: document.getElementById("btnCloseEntityPopup"),
  vehicleQuickMenu: document.getElementById("vehicleQuickMenu"),
  vehicleQuickMenuName: document.getElementById("vehicleQuickMenuName"),
  btnCloseVehicleQuickMenu: document.getElementById("btnCloseVehicleQuickMenu"),
  btnVehQuickChat: document.getElementById("btnVehQuickChat"),
  btnVehQuickAlert: document.getElementById("btnVehQuickAlert"),
  btnVehQuickRoute: document.getElementById("btnVehQuickRoute"),

  // Modal confirmación
  confirmationModal: document.getElementById("confirmationModal"),
  confirmationTitle: document.getElementById("confirmationTitle"),
  confirmationMessage: document.getElementById("confirmationMessage"),
  confirmationConfirmBtn: document.getElementById("confirmationConfirmBtn"),
  confirmationCancelBtn: document.getElementById("confirmationCancelBtn")
};
