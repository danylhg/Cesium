package com.operaciones.operaciones_android.wear.data

import org.json.JSONObject

enum class WearUserRole {
    CET,
    CELL,
    ADMIN,
    CUT;

    companion object {
        fun from(raw: String): WearUserRole =
            entries.firstOrNull { it.name == raw.uppercase() } ?: CELL
    }
}

enum class WearOperationStatus {
    PLANIFICADA,
    ACTIVA,
    CERRADA,
    CANCELADA;

    companion object {
        fun from(raw: String): WearOperationStatus =
            entries.firstOrNull { it.name == raw.uppercase() } ?: PLANIFICADA
    }
}

data class WearUser(
    val id: Int,
    val nombre: String,
    val apellido: String,
    val username: String,
    val rol: WearUserRole,
    val jerarquia: String,
    val tabla: String
) {
    val nombreCompleto: String
        get() = "$nombre $apellido".trim().ifBlank { username }
}

data class WearOperation(
    val id: Int,
    val codigo: String,
    val nombre: String,
    val descripcion: String,
    val prioridad: String,
    val status: WearOperationStatus,
    val fechaInicio: String,
    val fechaFin: String,
    val zonaLat: Double,
    val zonaLon: Double,
    val zonaZoom: Int
) {
    companion object {
        fun fromJson(json: JSONObject): WearOperation {
            val zona = json.optJSONObject("zona")
            return WearOperation(
                id = json.optInt("id_operacion", -1),
                codigo = json.optString("codigo", ""),
                nombre = json.optString("nombre", "Operacion"),
                descripcion = json.optString("descripcion", ""),
                prioridad = json.optString("prioridad", "MEDIA"),
                status = WearOperationStatus.from(json.optString("estado", "PLANIFICADA")),
                fechaInicio = json.optString("fecha_inicio", ""),
                fechaFin = json.optString("fecha_fin", ""),
                zonaLat = zona?.optDouble("centroide_lat", 0.0) ?: 0.0,
                zonaLon = zona?.optDouble("centroide_lon", 0.0) ?: 0.0,
                zonaZoom = zona?.optInt("zoom_inicial", 8000) ?: 8000
            )
        }
    }
}

data class WearChatMessage(
    val id: Int,
    val autor: String,
    val contenido: String,
    val tipo: String,
    val fecha: String,
    val destinatarioRol: String,
    val destinoTipo: String?,
    val destinoId: String?,
    val destinoLabel: String?,
    val attachmentKind: String?,
    val attachmentUrl: String?,
    val attachmentMime: String?,
    val attachmentName: String?
) {
    companion object {
        fun fromJson(json: JSONObject): WearChatMessage =
            WearChatMessage(
                id = json.optInt("id_mensaje", -1),
                autor = json.optString("autor_nombre", "Sistema"),
                contenido = json.optString("contenido", ""),
                tipo = json.optString("tipo_mensaje", "NORMAL"),
                fecha = json.optString("fecha_envio", ""),
                destinatarioRol = json.optString("destinatario_rol", "GLOBAL"),
                destinoTipo = json.optString("destino_tipo", "").takeIf { it.isNotBlank() },
                destinoId = json.optString("destino_id", "").takeIf { it.isNotBlank() },
                destinoLabel = json.optString("destino_label", "").takeIf { it.isNotBlank() },
                attachmentKind = json.optString("attachment_kind", "").takeIf { it.isNotBlank() },
                attachmentUrl = json.optString("attachment_url", "").takeIf { it.isNotBlank() },
                attachmentMime = json.optString("attachment_mime", "").takeIf { it.isNotBlank() },
                attachmentName = json.optString("attachment_name", "").takeIf { it.isNotBlank() }
            )
    }
}
