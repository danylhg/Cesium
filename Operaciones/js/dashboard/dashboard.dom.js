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
  gridSubmenu: document.getElementById("gridSubmenu"),
  gridSizeSelect: document.getElementById("gridSizeSelect"),
  generateGridBtn: document.getElementById("generateGridBtn"),
  clearGridBtn: document.getElementById("clearGridBtn"),
  gridNamesWrapper: document.getElementById("gridNamesWrapper"),
  gridNamesContainer: document.getElementById("gridNamesContainer"),
  milSymbolGenerator: document.getElementById("milSymbolGenerator"),
  milIdentity: document.getElementById("milIdentity"),
  milDimension: document.getElementById("milDimension"),
  milIcon: document.getElementById("milIcon"),
  milPreviewContainer: document.getElementById("milPreviewContainer"),
  buildingPreviewDrag: document.getElementById("buildingPreviewDrag"),
  iconPallet: document.getElementById("iconPallet"),
  symLabelContainer: document.getElementById("symLabelContainer"),
  symLabel: document.getElementById("symLabel"),
  finishShape: document.getElementById("finishShape"),
  cancelPlace: document.getElementById("cancelPlace"),
  tacticalActionButtons: document.getElementById("tacticalActionButtons"),
  clearTactical: document.getElementById("clearTactical"),
  colorContainer: document.getElementById("colorContainer"),
  colorSelect: document.getElementById("colorSelect"),
  opacityContainer: document.getElementById("opacityContainer"),
  opacityRange: document.getElementById("opacityRange"),
  opacityValue: document.getElementById("opacityValue"),
  widthContainer: document.getElementById("widthContainer"),
  widthRange: document.getElementById("widthRange"),
  widthValue: document.getElementById("widthValue"),
  radiusInput: document.getElementById("radiusInput"),
  radiusContainer: document.getElementById("radiusContainer"),

  // Chat
  chatAudiencePanel: document.getElementById("chatAudiencePanel"),
  chatAudienceSummary: document.getElementById("chatAudienceSummary"),
  chatAudienceToggle: document.getElementById("chatAudienceToggle"),
  chatAudienceBody: document.getElementById("chatAudienceBody"),
  chatPanel: document.getElementById("chatPanel"),
  toggleChatPanel: document.getElementById("toggleChatPanel"),
  chatTabCet: document.getElementById("chatTabCet"),
  chatTabCells: document.getElementById("chatTabCells"),
  chatChannelType: document.getElementById("chatChannelType"),
  chatChannelTarget: document.getElementById("chatChannelTarget"),
  chatConversationAvatar: document.getElementById("chatConversationAvatar"),
  chatConversationTitle: document.getElementById("chatConversationTitle"),
  chatConversationSubtitle: document.getElementById("chatConversationSubtitle"),
  chatTargetBox: document.getElementById("chatTargetBox"),
  chatTargetPicker: document.getElementById("chatTargetPicker"),
  chatTargetEmpty: document.getElementById("chatTargetEmpty"),
  chatMessages: document.getElementById("chatMessages"),
  chatInput: document.getElementById("chatInput"),
  sendChatBtn: document.getElementById("sendChatBtn"),
  chatImageBtn: document.getElementById("chatImageBtn"),
  chatEmojiBtn: document.getElementById("chatEmojiBtn"),
  chatAttachmentBtn: document.getElementById("chatAttachmentBtn"),
  chatAudioBtn: document.getElementById("chatAudioBtn"),
  chatImageInput: document.getElementById("chatImageInput"),
  chatAttachmentInput: document.getElementById("chatAttachmentInput"),
  chatAttachStatus: document.getElementById("chatAttachStatus"),
  // Cámaras
  cameraFeeds: document.getElementById("cameraFeeds"),
  cameraBackToGrid: document.getElementById("cameraBackToGrid"),
  cameraLayoutGrid: document.getElementById("cameraLayoutGrid"),
  cameraLayoutSpeaker: document.getElementById("cameraLayoutSpeaker"),
  cameraDronesBtn: document.getElementById("cameraDronesBtn"),
  obsStreamKey: document.getElementById("obsStreamKey"),
  registerObsStreamBtn: document.getElementById("registerObsStreamBtn"),
  obsStreamStatus: document.getElementById("obsStreamStatus"),

  // Panels
  infoPanel: document.getElementById("infoPanel"),
  routePanel: document.getElementById("routePanel"),
  tacticalPanel: document.getElementById("tacticalPanel"),
  cameraPanel: document.getElementById("cameraPanel"),

  toggleInfoPanel: document.getElementById("toggleInfoPanel"),
  toggleRoutePanel: document.getElementById("toggleRoutePanel"),
  toggleTacticalPanel: document.getElementById("toggleTacticalPanel"),
  toggleCameraPanel: document.getElementById("toggleCameraPanel"),

  // Área de planeación
  markAreaBtn: document.getElementById("markAreaBtn"),
  clearAreaBtn: document.getElementById("clearAreaBtn"),
  areaInfo: document.getElementById("areaInfo"),

  // Selección
  markZoneBtn: document.getElementById("markZoneBtn"),
  clearZoneBtn: document.getElementById("clearZoneBtn"),
  operationZoneControls: document.getElementById("operationZoneControls"),
  zoneColorSelect: document.getElementById("zoneColorSelect"),
  zoneWidthRange: document.getElementById("zoneWidthRange"),
  finishZoneBtn: document.getElementById("finishZoneBtn"),
  zoneActionBtns: document.getElementById("zoneActionBtns"),

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
  mapLayerControl: document.getElementById("mapLayerControl"),
  mapLayerButton: document.getElementById("mapLayerButton"),
  mapLayerMenu: document.getElementById("mapLayerMenu"),

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
  confirmationCancelBtn: document.getElementById("confirmationCancelBtn"),

  // Modal Detalle Personal
  personnelDetailModal: document.getElementById("personnelDetailModal"),
  personnelDetailBackdrop: document.getElementById("personnelDetailBackdrop"),
  btnClosePersonnelDetail: document.getElementById("btnClosePersonnelDetail"),
  personnelDetailName: document.getElementById("personnelDetailName"),
  personnelDetailCoords: document.getElementById("personnelDetailCoords"),
  personnelDetailCamera: document.getElementById("personnelDetailCamera"),
  btnCenterOnPerson: document.getElementById("btnCenterOnPerson"),
  personInfoPopup: document.getElementById("personInfoPopup"),
  personInfoPopupContent: document.getElementById("personInfoPopupContent"),
  btnClosePersonInfoPopup: document.getElementById("btnClosePersonInfoPopup")
};
