package com.operaciones.operaciones_android.model

data class EquipoItem(
    val idEquipo: Int,
    val numeroSerie: String,
    val nombre: String,
    val categoria: String,
    val detalle: String = "",
    val asignadoA: String = "",
    val personalAsignado: String = "",
    val vehiculoAsignado: String = ""
)