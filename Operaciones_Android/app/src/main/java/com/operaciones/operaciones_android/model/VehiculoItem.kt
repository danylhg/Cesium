package com.operaciones.operaciones_android.model

data class VehiculoItem(
    val idVehiculo: Int,
    val codigoInterno: String,
    val nombre: String,
    val tipo: String,
    val marca: String = "",
    val modelo: String = "",
    val detalle: String = "",
    val flotillaAsignada: String = "",
    val grupoNombre: String = "",
    val grupoApodo: String = "",
    val grupoPadreNombre: String = "",
    val grupoPadreApodo: String = "",
    val lat: Double? = null,
    val lon: Double? = null
)