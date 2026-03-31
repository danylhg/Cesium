package com.operaciones.operaciones_android.network

import com.operaciones.operaciones_android.config.ApiConfig
import com.operaciones.operaciones_android.model.EquipoItem
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException

class EquipoRepository(
    private val http: OkHttpClient = OkHttpClient()
) {
    private fun JSONObject.safeString(key: String): String {
        if (isNull(key)) return ""
        return optString(key, "").takeUnless { it.equals("null", ignoreCase = true) } ?: ""
    }

    fun fetchEquipos(
        operationId: Int,
        token: String,
        onSuccess: (List<EquipoItem>) -> Unit,
        onError: (String) -> Unit
    ) {
        val req = Request.Builder()
            .url("${ApiConfig.BASE_URL}/ops/$operationId/equipos-asignados")
            .get()
            .addHeader("Authorization", "Bearer $token")
            .build()

        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                onError("Sin conexión cargando equipos.")
            }

            override fun onResponse(call: Call, response: Response) {
                val bodyStr = response.body?.string() ?: ""

                try {
                    val json = JSONObject(bodyStr)
                    if (!response.isSuccessful || !json.optBoolean("ok")) {
                        onError(json.optString("mensaje", "No se pudieron cargar los equipos."))
                        return
                    }

                    val items = json.optJSONArray("items") ?: org.json.JSONArray()
                    val result = mutableListOf<EquipoItem>()

                    for (i in 0 until items.length()) {
                        val e = items.getJSONObject(i)

                        val tipoDestino = e.safeString("tipo_destino").uppercase()
                        val personalNombre = e.safeString("asignado_a_personal").ifBlank {
                            e.safeString("personal_apodo").ifBlank { e.safeString("personal_asignado") }
                        }
                        val vehiculoNombre = e.safeString("asignado_a_vehiculo").ifBlank {
                            e.safeString("vehiculo_asignado")
                        }
                        val grupoNombre = e.safeString("grupo_asignado")
                        val flotillaNombre = e.safeString("flotilla_nombre")

                        val asignadoA = when (tipoDestino) {
                            "PERSONAL" -> "Asignado a personal: $personalNombre"
                            "VEHICULO" -> "Asignado a vehículo: $vehiculoNombre"
                            "GRUPO" -> "Asignado a grupo: $grupoNombre"
                            "FLOTILLA" -> "Asignado a flotilla: $flotillaNombre"
                            else -> "Sin asignación"
                        }

                        val detalle = buildString {
                            val uso = e.safeString("uso_en_operacion")
                            val ns = e.safeString("numero_serie")

                            if (uso.isNotBlank()) append(uso)
                            if (uso.isNotBlank() && ns.isNotBlank()) append(" · ")
                            if (ns.isNotBlank()) append("S/N: $ns")
                        }

                        result.add(
                            EquipoItem(
                                idEquipo = e.optInt("id_equipo"),
                                numeroSerie = e.safeString("numero_serie"),
                                nombre = e.safeString("nombre").ifBlank { "Equipo" },
                                categoria = e.safeString("categoria"),
                                detalle = detalle,
                                asignadoA = asignadoA,
                                tipoDestino = tipoDestino,
                                personalAsignado = personalNombre,
                                vehiculoAsignado = vehiculoNombre,
                                grupoAsignado = grupoNombre,
                                flotillaAsignada = flotillaNombre
                            )
                        )
                    }

                    onSuccess(result)
                } catch (e: Exception) {
                    onError("Error procesando equipos.")
                }
            }
        })
    }
}