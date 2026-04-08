export const initialState = {
  // Estado persistente (lo que se guarda en storage)
  asignacionCelulas: {},
  asignacionVehiculos: [], // Estructura plana: [{ id_vehiculo, tipo_destino, id_personal, id_grupo_operacion }]
  asignacionEquipos: [], // Estructura plana: [{ id_equipo, tipo_destino, id_personal, id_grupo_operacion, categoria }]

  // Estado de navegación y UI temporal
  categoria: null,
  pasoPersonal: "home",
  cetActivoIndex: 0,
  cetActivoIndexVeh: 0,

  // Selecciones temporales
  cutSeleccionado: null,
  cetSeleccionados: [],
  selectedVehicle: null,
  selectedCells: [],
  equipoCategoria: null,
  equipoDestino: null,
  equipoSelectedItems: [],
  equipoSelectedResource: null,
  equipoSelectedCet: null,
  equipoSelectedGrupo: null,

  // Datos de catálogo (cargados desde API/storage)
  cutList: [],
  cetList: [],
  celulasList: [],
  vehiclesList: [],
  tacticalEquipmentList: [],
  communicationEquipmentList: [],

  // Mapeos para resolución de IDs (Nombre -> ID)
  personalMap: {}, // { "Nombre Apellido": id_personal }

  // Datos derivados o temporales
  flotillaByCet: {},
  searchByCet: {},
  gruposByCet: {}
};

export const state = structuredClone(initialState);