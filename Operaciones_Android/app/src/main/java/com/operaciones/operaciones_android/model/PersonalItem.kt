package com.operaciones.operaciones_android.model

data class PersonalItem(
    val idPersonal: Int,
    val apodo: String,
    val nombre: String,
    val apellido: String,
    val rol: String,
    val puesto: String,
    val lat: Double? = null,
    val lon: Double? = null,
    val grupoNombre: String = "",
    val grupoApodo: String = "",
    val idGrupoOperacion: Int? = null,
    val idGrupoPadre: Int? = null,
    val grupoPadreNombre: String = "",
    val grupoPadreApodo: String = "",
    val cetNombre: String = "",
    val cetFlotilla: String = ""
)
