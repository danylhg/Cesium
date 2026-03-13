package com.operaciones.operaciones_android.network

import com.operaciones.operaciones_android.config.ApiConfig
import com.operaciones.operaciones_android.model.EquipoItem
import com.operaciones.operaciones_android.model.OperationMapData
import com.operaciones.operaciones_android.model.PersonalItem
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException

class OperationMapRepository(
    private val http: OkHttpClient = OkHttpClient()
) {

    fun fetchMapaData(
        operationId: Int,
        token: String,
        onSuccess: (OperationMapData) -> Unit,
        onError: (String) -> Unit
    ) {
        val req = Request.Builder()
            .url("${ApiConfig.BASE_URL}/ops/$operationId/mapa")
            .get()
            .addHeader("Authorization", "Bearer $token")
            .build()

        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                onError("Sin conexión — paneles no disponibles.")
            }

            override fun onResponse(call: Call, response: Response) {
                val bodyStr = response.body?.string() ?: ""
                try {
                    val json = JSONObject(bodyStr)
                    if (!json.optBoolean("ok")) {
                        onError("No se pudieron cargar los datos del mapa.")
                        return
                    }

                    val capas = json.optJSONArray("capas")
                    val posPersonal = json.optJSONArray("personal")

                    val posMap = mutableMapOf<Int, Pair<Double, Double>>()
                    if (posPersonal != null) {
                        for (i in 0 until posPersonal.length()) {
                            val p = posPersonal.getJSONObject(i)
                            posMap[p.optInt("id_personal")] = Pair(
                                p.optDouble("latitud"),
                                p.optDouble("longitud")
                            )
                        }
                    }

                    val personal = mutableListOf<PersonalItem>()
                    if (capas != null) {
                        for (i in 0 until capas.length()) {
                            val c = capas.getJSONObject(i)
                            if (c.optString("tipo_capa") != "PERSONAL") continue
                            val idP = c.optInt("id_referencia")
                            val pos = posMap[idP]

                            personal.add(
                                PersonalItem(
                                    idPersonal = idP,
                                    apodo = c.optString("apodo", ""),
                                    nombre = c.optString("nombre", ""),
                                    apellido = c.optString("apellido", ""),
                                    rol = c.optString("rol", ""),
                                    puesto = c.optString("puesto", ""),
                                    lat = pos?.first,
                                    lon = pos?.second
                                )
                            )
                        }
                    }

                    val vehiculos = mutableListOf<EquipoItem>()
                    val posVehiculos = json.optJSONArray("vehiculos")
                    if (posVehiculos != null) {
                        for (i in 0 until posVehiculos.length()) {
                            val v = posVehiculos.getJSONObject(i)
                            vehiculos.add(
                                EquipoItem(
                                    id = v.optInt("id_vehiculo"),
                                    nombre = v.optString("nombre", v.optString("codigo_interno", "Vehículo")),
                                    detalle = v.optString("codigo_interno", ""),
                                    tipo = v.optString("tipo", "VEHÍCULO"),
                                    esVehiculo = true
                                )
                            )
                        }
                    }

                    val equipos = mutableListOf<EquipoItem>()
                    if (capas != null) {
                        for (i in 0 until capas.length()) {
                            val c = capas.getJSONObject(i)
                            if (c.optString("tipo_capa") != "EQUIPO") continue
                            equipos.add(
                                EquipoItem(
                                    id = c.optInt("id_referencia"),
                                    nombre = c.optString("nombre", "Equipo"),
                                    detalle = "S/N: ${c.optString("numero_serie", "-")}",
                                    tipo = c.optString("categoria", "EQUIPO"),
                                    esVehiculo = false
                                )
                            )
                        }
                    }

                    onSuccess(
                        OperationMapData(
                            personal = personal,
                            vehiculos = vehiculos,
                            equipos = equipos
                        )
                    )

                } catch (e: Exception) {
                    onError("Error cargando datos del mapa.")
                }
            }
        })
    }

    fun fetchPersonalData(
        operationId: Int,
        token: String,
        onSuccess: (List<PersonalItem>) -> Unit,
        onError: (String) -> Unit
    ) {
        val req = Request.Builder()
            .url("${ApiConfig.BASE_URL}/ops/$operationId/personal")
            .get()
            .addHeader("Authorization", "Bearer $token")
            .build()

        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                onError("Sin conexión cargando personal.")
            }

            override fun onResponse(call: Call, response: Response) {
                val bodyStr = response.body?.string() ?: ""
                try {
                    val json = JSONObject(bodyStr)

                    if (!response.isSuccessful || !json.optBoolean("ok")) {
                        onError(json.optString("mensaje", "No se pudo cargar el personal."))
                        return
                    }

                    val items = json.optJSONArray("items") ?: org.json.JSONArray()
                    val result = mutableListOf<PersonalItem>()

                    for (i in 0 until items.length()) {
                        val p = items.getJSONObject(i)
                        result.add(
                            PersonalItem(
                                idPersonal = p.optInt("id_personal"),
                                apodo = p.optString("apodo", ""),
                                nombre = p.optString("nombre", ""),
                                apellido = p.optString("apellido", ""),
                                rol = p.optString("rol", ""),
                                puesto = p.optString("puesto", ""),
                                lat = if (p.isNull("latitud")) null else p.optDouble("latitud"),
                                lon = if (p.isNull("longitud")) null else p.optDouble("longitud")
                            )
                        )
                    }

                    onSuccess(result)
                } catch (e: Exception) {
                    onError("Error procesando personal.")
                }
            }
        })
    }

}