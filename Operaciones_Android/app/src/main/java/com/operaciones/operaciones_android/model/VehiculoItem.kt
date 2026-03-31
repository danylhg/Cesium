package com.operaciones.operaciones_android.model

/**
 * Representa un vehículo asignado a la operación.
 *
 * [tipoDestino] refleja el nuevo modelo de BD:
 *   PERSONAL  → asignado a una persona específica ([asignadoAApodo])
 *   GRUPO     → asignado a un grupo dentro de la flotilla ([grupoNombre])
 *   FLOTILLA  → asignado a la flotilla completa ([grupoNombre] = nombre flotilla)
 */
data class VehiculoItem(
    val idVehiculo: Int,
    val codigoInterno: String,
    val nombre: String,
    val tipo: String,
    val alias: String = "",
    val detalle: String = "",

    // 🔥 Jerarquía real del backend (tipo_destino)
    val tipoDestino: String = "",       // "PERSONAL" | "GRUPO" | "FLOTILLA" | ""
    val asignadoAApodo: String = "",    // usado cuando tipoDestino == "PERSONAL"
    val grupoNombre: String = "",       // usado cuando tipoDestino == "GRUPO" o "FLOTILLA"

    val lat: Double? = null,
    val lon: Double? = null
)