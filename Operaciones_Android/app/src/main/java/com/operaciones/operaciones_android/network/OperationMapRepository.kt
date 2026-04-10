package com.operaciones.operaciones_android.network

import com.operaciones.operaciones_android.config.ApiConfig
import com.operaciones.operaciones_android.model.EquipoItem
import com.operaciones.operaciones_android.model.OperationMapData
import com.operaciones.operaciones_android.model.PersonalItem
import com.operaciones.operaciones_android.model.PoiItem
import com.operaciones.operaciones_android.model.VehiculoItem
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

                    if (!response.isSuccessful || !json.optBoolean("ok")) {
                        onError(json.optString("mensaje", "No se pudieron cargar los datos del mapa."))
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

                    val vehiculos = mutableListOf<VehiculoItem>()
                    val posVehiculos = json.optJSONArray("vehiculos")
                    if (posVehiculos != null) {
                        for (i in 0 until posVehiculos.length()) {
                            val v = posVehiculos.getJSONObject(i)

                            val codigoInterno = v.optString("codigo_interno", "")
                            val nombreVehiculo = v.optString("nombre", "").ifBlank {
                                if (codigoInterno.isNotBlank()) codigoInterno else "Vehículo"
                            }

                            vehiculos.add(
                                VehiculoItem(
                                    idVehiculo = v.optInt("id_vehiculo"),
                                    codigoInterno = codigoInterno,
                                    nombre = nombreVehiculo,
                                    tipo = v.optString("tipo", ""),
                                    detalle = ""
                                )
                            )
                        }
                    }

                    val equipos = mutableListOf<EquipoItem>()
                    if (capas != null) {
                        for (i in 0 until capas.length()) {
                            val c = capas.getJSONObject(i)
                            if (c.optString("tipo_capa") != "EQUIPO") continue

                            val numeroSerie = c.optString("numero_serie", "")

                            equipos.add(
                                EquipoItem(
                                    idEquipo = c.optInt("id_referencia"),
                                    numeroSerie = numeroSerie,
                                    nombre = c.optString("nombre", "Equipo"),
                                    categoria = c.optString("categoria", ""),
                                    detalle = if (numeroSerie.isNotBlank()) "S/N: $numeroSerie" else "",
                                    asignadoA = ""
                                )
                            )
                        }
                    }

                    val poisSource = json.optJSONArray("pois") ?: capas
                    val pois = mutableListOf<PoiItem>()
                    if (poisSource != null) {
                        for (i in 0 until poisSource.length()) {
                            val c = poisSource.getJSONObject(i)
                            val isPoi = c.optString("tipo_capa").isBlank() || c.optString("tipo_capa") == "POI"
                            if (!isPoi) continue

                            val idPoi = if (c.has("id_poi")) c.optInt("id_poi") else c.optInt("id_elemento")
                            if (idPoi <= 0) continue

                            pois.add(
                                PoiItem(
                                    idPoi = idPoi,
                                    nombre = c.optString("nombre", "PDI"),
                                    tipoPoi = if (c.has("tipo_poi")) c.optString("tipo_poi", "") else c.optString("subtipo", ""),
                                    lat = c.optDouble("latitud"),
                                    lon = c.optDouble("longitud"),
                                    color = c.optString("color", "#FFD700").ifBlank { "#FFD700" }
                                )
                            )
                        }
                    }

                    val rutasNav = json.optJSONArray("rutas_navegacion")?.toString()

                    onSuccess(
                        OperationMapData(
                            personal = personal,
                            vehiculos = vehiculos,
                            equipos = equipos,
                            rutasNavegacion = rutasNav,
                            pois = pois
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
