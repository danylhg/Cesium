package com.operaciones.operaciones_android.network

import com.operaciones.operaciones_android.config.ApiConfig
import com.operaciones.operaciones_android.model.VehiculoItem
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException

class VehiculoRepository(
    private val http: OkHttpClient = OkHttpClient()
) {
    private fun JSONObject.safeString(key: String): String {
        if (isNull(key)) return ""
        return optString(key, "").takeUnless { it.equals("null", ignoreCase = true) } ?: ""
    }

    fun fetchVehiculos(
        operationId: Int,
        token: String,
        onSuccess: (List<VehiculoItem>) -> Unit,
        onError: (String) -> Unit
    ) {
        val req = Request.Builder()
            .url("${ApiConfig.BASE_URL}/ops/$operationId/vehiculos-asignados")
            .get()
            .addHeader("Authorization", "Bearer $token")
            .build()

        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                onError("Sin conexión cargando vehículos.")
            }

            override fun onResponse(call: Call, response: Response) {
                val bodyStr = response.body?.string() ?: ""

                try {
                    val json = JSONObject(bodyStr)
                    if (!response.isSuccessful || !json.optBoolean("ok")) {
                        onError(json.optString("mensaje", "No se pudieron cargar los vehículos."))
                        return
                    }

                    val items = json.optJSONArray("items") ?: org.json.JSONArray()
                    val result = mutableListOf<VehiculoItem>()

                    for (i in 0 until items.length()) {
                        val v = items.getJSONObject(i)

                        val grupoApodo = v.safeString("grupo_apodo")
                        val grupoNombre = v.safeString("grupo_nombre")
                        val grupoPadreApodo = v.safeString("grupo_padre_apodo")
                        val grupoPadreNombre = v.safeString("grupo_padre_nombre")

                        val grupoTexto = when {
                            grupoApodo.isNotBlank() -> grupoApodo
                            grupoNombre.isNotBlank() -> grupoNombre
                            else -> ""
                        }

                        val alias = v.safeString("alias")
                        val codigoInterno = v.safeString("codigo_interno")

                        val nombreVehiculo = listOf(alias)
                            .filter { it.isNotBlank() }
                            .joinToString(" ")
                            .ifBlank { codigoInterno.ifBlank { "Vehículo" } }

                        result.add(
                            VehiculoItem(
                                idVehiculo = v.optInt("id_vehiculo"),
                                codigoInterno = codigoInterno,
                                nombre = nombreVehiculo,
                                tipo = v.safeString("tipo"),
                                alias = alias,
                                detalle = v.safeString("uso_en_operacion"),
                                flotillaAsignada = grupoTexto,
                                grupoNombre = grupoNombre,
                                grupoApodo = grupoApodo,
                                grupoPadreNombre = grupoPadreNombre,
                                grupoPadreApodo = grupoPadreApodo,
                                lat = if (v.isNull("latitud")) null else v.optDouble("latitud"),
                                lon = if (v.isNull("longitud")) null else v.optDouble("longitud")
                            )
                        )
                    }

                    onSuccess(result)
                } catch (e: Exception) {
                    onError("Error procesando vehículos.")
                }
            }
        })
    }
}