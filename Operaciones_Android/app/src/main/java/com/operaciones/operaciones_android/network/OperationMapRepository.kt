package com.operaciones.operaciones_android.network

import com.operaciones.operaciones_android.config.ApiConfig
import com.operaciones.operaciones_android.model.OperationMapData
import com.operaciones.operaciones_android.model.PersonalItem
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

class OperationMapRepository(
    private val http: OkHttpClient = OkHttpClient(),
    private val parser: OperationMapParser = OperationMapParser()
) {

    fun fetchMapaData(
        operationId: Int,
        token: String,
        onSuccess: (OperationMapData) -> Unit,
        onError: (String) -> Unit
    ) {
        http.newCall(authorizedGet("/ops/$operationId/mapa", token)).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                onError("Sin conexion - paneles no disponibles.")
            }

            override fun onResponse(call: Call, response: Response) {
                handleJsonResponse(
                    response = response,
                    defaultError = "No se pudieron cargar los datos del mapa.",
                    parseError = "Error cargando datos del mapa.",
                    parse = { parser.parseMapData(it) },
                    onSuccess = onSuccess,
                    onError = onError
                )
            }
        })
    }

    fun fetchPersonalData(
        operationId: Int,
        token: String,
        onSuccess: (List<PersonalItem>) -> Unit,
        onError: (String) -> Unit
    ) {
        http.newCall(authorizedGet("/ops/$operationId/personal", token)).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                onError("Sin conexion cargando personal.")
            }

            override fun onResponse(call: Call, response: Response) {
                handleJsonResponse(
                    response = response,
                    defaultError = "No se pudo cargar el personal.",
                    parseError = "Error procesando personal.",
                    parse = { json ->
                        parser.parsePersonalList(json.optJSONArray("items") ?: JSONArray())
                    },
                    onSuccess = onSuccess,
                    onError = onError
                )
            }
        })
    }

    private fun authorizedGet(path: String, token: String): Request =
        Request.Builder()
            .url("${ApiConfig.BASE_URL}$path")
            .get()
            .addHeader("Authorization", "Bearer $token")
            .build()

    private fun <T> handleJsonResponse(
        response: Response,
        defaultError: String,
        parseError: String,
        parse: (JSONObject) -> T,
        onSuccess: (T) -> Unit,
        onError: (String) -> Unit
    ) {
        response.use {
            val bodyStr = it.body?.string().orEmpty()

            try {
                val json = JSONObject(bodyStr)

                if (!it.isSuccessful || !json.optBoolean("ok")) {
                    onError(json.optString("mensaje", defaultError))
                    return
                }

                onSuccess(parse(json))
            } catch (e: Exception) {
                onError(parseError)
            }
        }
    }
}
