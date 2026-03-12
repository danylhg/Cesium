package com.operaciones.operaciones_android.model

data class PersonalItem(
    val idPersonal: Int,
    val apodo: String,
    val nombre: String,
    val apellido: String,
    val rol: String,
    val puesto: String,
    val lat: Double?,
    val lon: Double?
)