import {
  opNombreEl,
  opDescEl,
  opInicioEl,
  opHoraInicioEl,
  opPrioridadEl,
  lblOperacion
} from "../../core/dom.js";

import { normalizeText } from "../../core/utils.js";
import { readObjectStorage, writeStorage } from "../../core/storage.js";
import { STORAGE_OPERACION_ACTUAL } from "../../core/constants.js";

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

  const title = getOperacionNombreActual();
  const description = normalizeText(opDescEl?.value);
  const fechaInicio = normalizeText(opInicioEl?.value);
  const horaInicio = normalizeText(opHoraInicioEl?.value);
  const prioridad = normalizeText(opPrioridadEl?.value);

  return {
    ...prev,
    id: prev.id || crypto.randomUUID(),
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
  // BACKEND: Esta función se vuelve async. Si no hay id_operacion → POST /ops { nombre, descripcion, prioridad, fecha_inicio }
  // Respuesta: { id_operacion, codigo, nombre, ... } — guardar id_operacion en state.
  // Si hay id_operacion → PUT /ops/:id (solo si estado === 'PLANIFICADA')
  // Todo el bloque de sincronización con "operations" en localStorage desaparece.
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
  } catch {}

  if (lblOperacion) {
    lblOperacion.textContent = op.title || "—";
  }

  return op;
}

export function loadOperacionActualIntoForm() {
  // BACKEND: Esta función se vuelve async. GET /ops/:id → { id_operacion, nombre, descripcion, prioridad, fecha_inicio, estado }
  // Se llama en init() si hay active_operation_id. Los campos del form se rellenan con la respuesta del servidor;
  // el fallback a localStorage desaparece.
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