import {
  opNombreEl,
  opDescEl,
  opInicioEl,
  opHoraInicioEl,
  opPrioridadEl,
  lblOperacion
} from "../../core/dom.js";

import { normalizeText, generateUUID } from "../../core/utils.js";
import { readObjectStorage, writeStorage } from "../../core/storage.js";
import { STORAGE_OPERACION_ACTUAL } from "../../core/constants.js";
import { state } from "../../core/state.js";

const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;

async function apiFetch(path, method = "GET", body = null) {
  const token = localStorage.getItem("token");
  const options = {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  };
  if (body) options.body = JSON.stringify(body);

  try {
    const response = await fetch(`${API_BASE}${path}`, options);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[API ERROR DETAIL] ${method} ${path}`, {
        status: response.status,
        mensaje: errorData.mensaje,
        detalle: errorData.detalle,
        pg_code: errorData.pg_code
      });
      const detailSuffix = errorData.detalle ? ` | ${errorData.detalle}` : "";
      throw new Error((errorData.mensaje || `Error ${response.status}: ${response.statusText}`) + detailSuffix);
    }
    return await response.json();
  } catch (error) {
    console.error(`Fallo en petición [${method} ${path}]:`, error.message);
    if (
      String(error?.message || "").toLowerCase().includes("ya existe una operacion con ese nombre") ||
      String(error?.message || "").toLowerCase().includes("ya existe una operaciÃ³n con ese nombre")
    ) {
      showNombreOperacionError("Ya existe una operación con ese nombre.");
    }
    throw error;
  }
}

export async function savePersonalAsignacion(idOperacion, items) {
  return apiFetch(`/ops/${idOperacion}/personal`, "POST", { items });
}

export async function saveGruposAsignacion(idOperacion, grupos, directos = {}) {
  console.log("[SYNC] saveGruposAsignacion payload →", {
    id_operacion: idOperacion,
    grupos,
    directos
  });
  console.log("[SYNC] saveGruposAsignacion payload JSON →", JSON.stringify({
    id_operacion: idOperacion,
    grupos,
    directos
  }, null, 2));
  return apiFetch(`/ops/${idOperacion}/grupos`, "POST", { grupos, directos });
}

export async function saveVehiculosAsignacion(idOperacion, items) {
  // El nuevo formato espera [{ id_vehiculo, id_personal, id_grupo_operacion, nivel_asignacion }]
  return apiFetch(`/ops/${idOperacion}/vehiculos`, "POST", { items });
}

export async function saveEquiposAsignacion(idOperacion, items) {
  return apiFetch(`/ops/${idOperacion}/equipos`, "POST", { items });
}

export async function saveDispositivosAsignacion(idOperacion, items) {
  return apiFetch(`/ops/${idOperacion}/dispositivos`, "POST", { items });
}

export async function syncOperacionCompleta(idOperacion) {
  const { buildAsignacionActual } = await import("../asignacion/asignacion.service.js");
  const payload = buildAsignacionActual();

  // 1. Preparar Personal
  const personalItems = [];
  if (payload.cut) {
    const id = state.personalMap[payload.cut];
    if (id) personalItems.push({ id_personal: id, rol_en_operacion: 'CUT' });
  }
  payload.cets.forEach(n => {
    const id = state.personalMap[n];
    if (id) personalItems.push({ id_personal: id, rol_en_operacion: 'CET' });
  });
  Object.values(payload.asignacionCelulas).flat().forEach(celName => {
    const id = state.personalMap[celName];
    if (id) personalItems.push({ id_personal: id, rol_en_operacion: 'CELL' });
  });

  // 2. Preparar Grupos
  const gruposData = [];
  const directosData = {}; // Para mando directo sin subgrupo

  payload.cets.forEach(cetName => {
    const id_cet = state.personalMap[cetName];
    const flotilla = state.flotillaByCet[cetName] || "GENERAL";
    const ginfo = state.gruposByCet[cetName];
    const todasLasCelulas = payload.asignacionCelulas[cetName] || [];

    if (ginfo && ginfo.names && ginfo.names.length > 0) {
      ginfo.names.forEach(gName => {
        const integrantesNames = Array.from(ginfo.map[gName] || []);
        const integrantes = integrantesNames
          .map(n => state.personalMap[n])
          .filter(Boolean);

        const vehsInGroup = payload.asignacionVehiculos
          .filter(v => v.tipo_destino === 'grupo' && v.id_grupo_operacion === gName);

        gruposData.push({
          nombre: gName,
          id_cet,
          cet_nombre: cetName,
          flotilla,
          integrantes,
          vehiculos: vehsInGroup.map(v => ({
            id_vehiculo: v.id_vehiculo,
            id_personal: id_cet
          }))
        });
      });

      // 2.1 Identificar Células asignadas a algún subgrupo
      const todasAsignadasEnGrupos = new Set();
      ginfo.names.forEach(gName => {
        const integrantesNames = Array.from(ginfo.map[gName] || []);
        integrantesNames.forEach(n => todasAsignadasEnGrupos.add(n.trim()));
      });

      // 2.2 Filtrar células que quedaron "sueltas" fuera de subgrupos
      const sueltasIds = todasLasCelulas
        .filter(celName => !todasAsignadasEnGrupos.has(celName.trim())) // No están en ningún grupo
        .filter(celName => celName.trim() !== cetName.trim())           // No es el propio CET
        .map(celName => state.personalMap[celName.trim()])
        .filter(Boolean);

      if (sueltasIds.length > 0 && id_cet) {
        directosData[id_cet] = sueltasIds;
      }
    } else {
      // El CET no tiene subgrupos, pero necesitamos crear su Flotilla
      gruposData.push({
        nombre: null, 
        id_cet,
        cet_nombre: cetName,
        flotilla,
        integrantes: [],
        vehiculos: []
      });

      // Todas sus celulas van a mando directo (directosData), excepto el CET mismo
      const sueltasIds = todasLasCelulas
        .filter(celName => celName.trim() !== cetName.trim())
        .map(celName => state.personalMap[celName.trim()])
        .filter(Boolean);

      if (sueltasIds.length > 0 && id_cet) {
        directosData[id_cet] = sueltasIds;
      }
    }
  });

  try {
    console.log("[SYNC] payload base asignacion →", payload);
    console.log("[SYNC] payload base asignacion JSON →", JSON.stringify(payload, null, 2));
    console.log("[SYNC] personalItems →", personalItems);
    console.log("[SYNC] personalItems JSON →", JSON.stringify(personalItems, null, 2));
    console.log("[SYNC] gruposData →", gruposData);
    console.log("[SYNC] gruposData JSON →", JSON.stringify(gruposData, null, 2));
    console.log("[SYNC] directosData →", directosData);
    console.log("[SYNC] directosData JSON →", JSON.stringify(directosData, null, 2));

    // A. Guardar Personal
    await savePersonalAsignacion(idOperacion, personalItems);

    // A.1 Limpiar recursos dependientes antes de reconstruir grupos.
    // Esto evita que /grupos choque con referencias previas todavía vivas.
    await saveEquiposAsignacion(idOperacion, []);
    await saveDispositivosAsignacion(idOperacion, []);
    await saveVehiculosAsignacion(idOperacion, []);

    // B. Guardar Grupos y obtener IDs reales
    const resGrupos = await saveGruposAsignacion(idOperacion, gruposData, directosData);
    const celulasMap = resGrupos.celulas || {}; // Nombre -> ID Real

    // C. Preparar Vehículos (Standalone y con IDs de grupo reales)
    const vehiculosFinal = payload.asignacionVehiculos.map(v => {
      let id_personal = v.id_personal;
      let id_grupo_operacion = null;
      let nivel_asignacion = 'OPERACION';

      if (v.tipo_destino === 'grupo') {
        id_grupo_operacion = celulasMap[v.id_grupo_operacion] || null;
        nivel_asignacion = 'GRUPO';
        // Para grupos, el custodio es el CET (buscamos quién es el CET de ese grupo)
        for (const g of gruposData) {
          if (g.nombre === v.id_grupo_operacion) {
            id_personal = g.id_cet;
            break;
          }
        }
      } else if (v.tipo_destino === 'personal') {
        nivel_asignacion = 'OPERACION';
        // id_personal ya debería venir en v.id_personal
      }

      return {
        id_vehiculo: v.id_vehiculo,
        id_personal,
        id_grupo_operacion,
        nivel_asignacion
      };
    });

    await saveVehiculosAsignacion(idOperacion, vehiculosFinal);

    // D. Equipos
    const equiposFinal = payload.asignacionEquipos.map(e => ({
      id_equipo: e.id_equipo,
      tipo_destino: e.tipo_destino,
      id_personal: e.id_personal || null,
      id_vehiculo: e.id_vehiculo || null,
      cantidad: 1
    }));

    await saveEquiposAsignacion(idOperacion, equiposFinal);

    const dispositivosFinal = (payload.asignacionDispositivos || []).map(d => ({
      id_dispositivo: d.id_dispositivo,
      id_personal: d.id_personal
    }));

    await saveDispositivosAsignacion(idOperacion, dispositivosFinal);

    console.log("Sincronización completa exitosa");
    return { ok: true };
  } catch (err) {
    console.error("Error sincronizando:", err);
    return { ok: false, error: err.message };
  }
}

function getOrCreateErrorDiv(inputEl, msg) {
  if (!inputEl) return null;
  let errDiv = inputEl.nextElementSibling;
  if (!errDiv || !errDiv.classList.contains('op-inline-error')) {
    errDiv = document.createElement("div");
    errDiv.className = "op-inline-error";
    errDiv.style.cssText = "color:#dc2626;font-size:12px;margin-top:4px;margin-bottom:8px;display:none;";
    errDiv.textContent = msg;
    inputEl.parentNode.insertBefore(errDiv, inputEl.nextSibling);
  }
  return errDiv;
}

function showNombreOperacionError(message) {
  if (!opNombreEl) return;
  const errorDiv = getOrCreateErrorDiv(opNombreEl, message);
  if (!errorDiv) return;
  opNombreEl.style.borderColor = "#dc2626";
  errorDiv.textContent = message;
  errorDiv.style.display = "block";
  opNombreEl.focus();
}

export function validarOperacionInfo() {
  const fields = [
    { input: opNombreEl, msg: "El nombre de la operación es obligatorio." },
    { input: opInicioEl, msg: "La fecha de inicio es obligatoria." },
    { input: opPrioridadEl, msg: "La prioridad es obligatoria." }
  ];

  let isValid = true;
  let firstInvalid = null;

  fields.forEach(({ input, msg }) => {
    if (!input) return;
    const errorDiv = getOrCreateErrorDiv(input, msg);
    if (!errorDiv) return;

    if (!input.value.trim()) {
      input.style.borderColor = "#dc2626";
      errorDiv.style.display = "block";
      if (!firstInvalid) firstInvalid = input;
      isValid = false;
    } else {
      input.style.borderColor = "";
      errorDiv.style.display = "none";
    }
  });

  if (firstInvalid) {
    firstInvalid.focus();
  }

  return isValid;
}

export function getOperacionNombreActual() {
  const fromInput = normalizeText(opNombreEl?.value);
  if (fromInput) return fromInput;

  const fromLabel = normalizeText(lblOperacion?.textContent);
  if (fromLabel && fromLabel !== "—") return fromLabel;

  const fromStorage = readObjectStorage(STORAGE_OPERACION_ACTUAL, {});
  return normalizeText(fromStorage.title || fromStorage.titulo);
}

export function collectOperacionActualFromForm() {
  const prev = readObjectStorage(STORAGE_OPERACION_ACTUAL, {});

  let safeId = prev.id;
  if (typeof safeId === 'string' && isNaN(Number(safeId))) {
    safeId = null; // Reemplazar UUIDs o strings basura por null para que el backend cree la operación
  }

  const title = getOperacionNombreActual();
  const description = normalizeText(opDescEl?.value);
  const fechaInicio = normalizeText(opInicioEl?.value);
  const horaInicio = normalizeText(opHoraInicioEl?.value);
  const prioridad = normalizeText(opPrioridadEl?.value);

  return {
    ...prev,
    id: safeId,
    title,
    titulo: title,
    description,
    descripcion: description,
    fecha_inicio: fechaInicio,
    hora_inicio: horaInicio,
    prioridad,
    created_at: prev.created_at || new Date().toISOString()
  };
}

export function collectOperacionActual() {
  return collectOperacionActualFromForm();
}

export function saveOperacionActual(op = collectOperacionActualFromForm()) {
  writeStorage(STORAGE_OPERACION_ACTUAL, op);

  if (op.id) {
    writeStorage(`operacion_op_${op.id}`, op);
  }

  try {
    const opsList = JSON.parse(localStorage.getItem("operations") || "[]");
    const idx = opsList.findIndex(
      x => x.id === op.id || x.name === op.title || x.name === op.titulo
    );

    if (idx !== -1) {
      if (op.fecha_inicio) opsList[idx].fecha_inicio = op.fecha_inicio;
      if (op.hora_inicio) opsList[idx].hora_inicio = op.hora_inicio;
      if (op.id) opsList[idx].id = op.id;
      opsList[idx].name = op.title || op.titulo || opsList[idx].name;
    } else if (op.id && (op.title || op.titulo)) {
      opsList.push({
        id: op.id,
        name: op.title || op.titulo,
        phase: op.phase || "planificada",
        fecha_inicio: op.fecha_inicio || "",
        hora_inicio: op.hora_inicio || "",
        created_at: op.created_at || new Date().toISOString()
      });
    }

    localStorage.setItem("operations", JSON.stringify(opsList));
  } catch { }

  if (lblOperacion) {
    lblOperacion.textContent = op.title || "—";
  }

  return op;
}

export function loadOperacionActualIntoForm() {
  const stored = readObjectStorage(STORAGE_OPERACION_ACTUAL, {});
  const nombreDesdeQS = normalizeText(lblOperacion?.textContent);

  const nombre =
    normalizeText(stored.title || stored.titulo) ||
    (nombreDesdeQS && nombreDesdeQS !== "—" ? nombreDesdeQS : "");

  if (opNombreEl) opNombreEl.value = nombre;
  if (opDescEl) opDescEl.value = normalizeText(stored.description || stored.descripcion);
  if (opInicioEl) opInicioEl.value = normalizeText(stored.fecha_inicio);
  if (opHoraInicioEl) opHoraInicioEl.value = normalizeText(stored.hora_inicio);
  if (opPrioridadEl) opPrioridadEl.value = normalizeText(stored.prioridad);

  if (lblOperacion) {
    lblOperacion.textContent = nombre || "—";
  }
}

// --- FUNCIONES DE SINCRONIZACIÓN CON EL BACKEND (BD) ---

/**
 * Guarda la operación actual en el backend. 
 * Si no tiene ID, crea una nueva (POST). 
 * Si tiene ID y está PLANIFICADA, la actualiza (PUT).
 */
export async function guardarOperacionBaseDatos(datosFormulario, estadoActual) {
  let { id_operacion, estado_operacion } = estadoActual;

  if (typeof id_operacion === 'string' && isNaN(Number(id_operacion))) {
    id_operacion = null;
  }

  try {
    // CUÁNDO: Si NO hay id_operacion en state
    // PARA QUÉ: Crear nueva operación
    if (!id_operacion) {
      const payload = {
        nombre: datosFormulario.title || datosFormulario.titulo || datosFormulario.nombre,
        descripcion: datosFormulario.description || datosFormulario.descripcion,
        fecha_inicio: datosFormulario.fecha_inicio,
        hora_inicio: datosFormulario.hora_inicio,
        prioridad: datosFormulario.prioridad
      };

      try {
        const nuevaOperacion = await apiFetch('/ops', 'POST', payload);
        console.log("Operación creada en BD con éxito:", nuevaOperacion);
        if (nuevaOperacion?.id_operacion) {
          localStorage.setItem("active_operation_id", nuevaOperacion.id_operacion);
        }
        return nuevaOperacion;
      } catch (postErr) {
        // Si falla por duplicado (nombre ya existe de un intento previo),
        // busca la operación existente por nombre y la reutiliza
        const esDuplicado = postErr.message &&
          (postErr.message.toLowerCase().includes('duplicado') ||
           postErr.message.toLowerCase().includes('único') ||
           postErr.message.toLowerCase().includes('unique'));

        if (String(postErr?.message || "").toLowerCase().includes("ya existe una operacion con ese nombre") ||
            String(postErr?.message || "").toLowerCase().includes("ya existe una operación con ese nombre")) {
          showNombreOperacionError("Ya existe una operación con ese nombre.");
          throw postErr;
        }

        if (esDuplicado) {
          showNombreOperacionError("Ya existe una operación con ese nombre.");
          throw postErr;
          try {
            const listData = await apiFetch('/ops', 'GET');
            const nombreBuscado = (payload.nombre || '').trim().toLowerCase();
            const existing = (listData.items || []).find(op =>
              op.nombre?.trim().toLowerCase() === nombreBuscado &&
              !['CERRADA', 'CANCELADA'].includes(op.estado)
            );
            if (existing) {
              console.log("Operación ya existía, reutilizando ID:", existing.id_operacion);
              // Persistir el ID en localStorage para que los siguientes pasos usen PUT
              const opLoc = readObjectStorage(STORAGE_OPERACION_ACTUAL, {});
              if (!opLoc.id) {
                opLoc.id = existing.id_operacion;
                if (existing.estado) opLoc.estado = existing.estado;
                writeStorage(STORAGE_OPERACION_ACTUAL, opLoc);
              }
              localStorage.setItem("active_operation_id", existing.id_operacion);
              return existing;
            }
          } catch (fetchErr) {
            console.warn("No se pudo recuperar la operación existente:", fetchErr.message);
          }
        }

        throw postErr;
      }
    }

    // CUÁNDO: Si YA hay id y el estado === "PLANIFICADA" o no está definido
    // PARA QUÉ: Actualizar nombre/descripción/prioridad/fechas
    else if (id_operacion && (!estado_operacion || estado_operacion === 'PLANIFICADA')) {
      const operacionActualizada = await apiFetch(`/ops/${id_operacion}`, 'PUT', {
        nombre: datosFormulario.title || datosFormulario.titulo || datosFormulario.nombre,
        descripcion: datosFormulario.description || datosFormulario.descripcion,
        fecha_inicio: datosFormulario.fecha_inicio,
        hora_inicio: datosFormulario.hora_inicio,
        prioridad: datosFormulario.prioridad
      });
      console.log("Operación actualizada en BD con éxito:", operacionActualizada);
      return operacionActualizada;
    }

    else {
      console.warn("La operación ya no está en fase de planificación. No se puede modificar cabecera.");
      return null;
    }

  } catch (error) {
    console.error("Error al intentar guardar la operación DB:", error);
    throw error;
  }
}

/**
 * Carga una operación desde el servidor (BD) para rellenar el formulario.
 */
export async function cargarOperacionRemota(active_operation_id) {
  // CUÁNDO: Al init() si hay active_operation_id
  // PARA QUÉ: Cargar operación en el formulario
  if (!active_operation_id) {
    console.log("No hay una operación activa remota para cargar.");
    return null;
  }

  try {
    const operacionCargada = await apiFetch(`/ops/${active_operation_id}`, 'GET');
    console.log("Operación cargada desde BD:", operacionCargada);
    return operacionCargada;

  } catch (error) {
    console.error(`Error al cargar la operación con ID ${active_operation_id} desde BD:`, error);
    throw error;
  }
}

