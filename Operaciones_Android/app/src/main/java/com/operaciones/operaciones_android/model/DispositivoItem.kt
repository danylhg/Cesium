package com.operaciones.operaciones_android.model

data class DispositivoItem(
    val idDispositivo: Int,
    val idPersonal: Int,
    val tipo: String,
    val marca: String,
    val modelo: String,
    val numeroTelefono: String,
    val imei: String,
    val numeroSerie: String,
    val sistemaOperativo: String,
    val detalles: String,
    val personalNombre: String,
    val personalApellido: String,
    val personalPuesto: String
)
