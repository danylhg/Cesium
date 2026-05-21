package com.operaciones.operaciones_android.ui.map

import android.text.InputType
import android.util.Log
import android.view.View
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.operaciones.operaciones_android.R
import com.operaciones.operaciones_android.config.ApiConfig
import com.operaciones.operaciones_android.map.MapActionController
import com.operaciones.operaciones_android.model.ChatMessage
import com.operaciones.operaciones_android.model.MessageType
import com.operaciones.operaciones_android.model.User
import com.operaciones.operaciones_android.network.DrawingRepository
import com.operaciones.operaciones_android.webview.CesiumWebController
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

class MapObjectsController(
    private val activity: AppCompatActivity,
    private val cesiumWebController: CesiumWebController,
    private val httpClient: OkHttpClient,
    private val drawingRepository: DrawingRepository = DrawingRepository(),
    private val host: Host
) : MapActionController.Host {

    interface Host {
        fun getMapOperationId(): Int
        fun getMapToken(): String
        fun getMapCurrentUser(): User
        fun addMapMessage(msg: ChatMessage)
        fun openMapChatPanel()
        fun isMapChatPanelActive(): Boolean
        fun selectMapPersonal(idPersonal: Int?)
    }

    private data class SelectedMapObject(
        val kind: String,
        val id: Int?,
        val localId: String?,
        val label: String
    )

    private enum class ObjectTool {
        MIL,
        POI,
        POLYGON,
        CIRCLE,
        ROUTE_START,
        ROUTE_END,
        BUILDING,
        LABEL
    }

    private val mapActionController = MapActionController(this, cesiumWebController)
    private val drawingLocalToBackendId = HashMap<String, Int>()
    private val polygonToolPoints = mutableListOf<Pair<Double, Double>>()

    private var drawingMode: String? = null
    private var selectedObjectTool: ObjectTool? = null
    private var objectToolSelectionView: TextView? = null
    private var selectedMapObject: SelectedMapObject? = null
    private var deleteButton: ImageButton? = null
    private var lastRouteId: Int = -1

    fun setupDeleteButton(button: ImageButton) {
        deleteButton = button
        button.setOnClickListener { deleteSelectedMapObject() }
    }

    fun onMapObjectSelectedFromBridge(payloadJson: String) {
        val selected = runCatching {
            val payload = JSONObject(payloadJson)
            SelectedMapObject(
                kind = payload.optString("kind").trim().lowercase(),
                id = payload.optInt("id", -1).takeIf { it > 0 },
                localId = payload.optString("localId", "").trim().takeIf { it.isNotBlank() },
                label = payload.optString("label", "Objeto").trim().ifBlank { "Objeto" }
            )
        }.getOrNull() ?: return

        if (selected.kind.isBlank() || (selected.id == null && selected.localId == null)) return

        if (selected.kind == "personal") {
            val idPersonal = selected.id ?: return
            selectedMapObject = null
            deleteButton?.visibility = View.GONE
            activity.findViewById<View>(R.id.objectToolsMenu)?.visibility = View.GONE
            host.selectMapPersonal(idPersonal)
            Toast.makeText(activity, "${selected.label} seleccionado.", Toast.LENGTH_SHORT).show()
            return
        }

        selectedMapObject = selected
        deleteButton?.visibility = View.VISIBLE
        activity.findViewById<View>(R.id.objectToolsMenu)?.visibility = View.GONE
        Toast.makeText(activity, "${selected.label} seleccionado.", Toast.LENGTH_SHORT).show()
    }

    fun clearSelectedMapObject() {
        selectedMapObject = null
        host.selectMapPersonal(null)
        cesiumWebController.clearTrackingSelection()
        deleteButton?.visibility = View.GONE
    }

    fun showMapActionDialogFromBridge(lat: Double, lon: Double) {
        if (handleSelectedObjectToolTap(lat, lon)) return
        mapActionController.showMapActionDialog(host.getMapCurrentUser(), lat, lon)
    }

    fun onRouteCreatedFromBridge(payloadJson: String) {
        Log.d("RUTA_ANDROID", "Ruta recibida desde bridge: $payloadJson")
        sendRouteToBackend(payloadJson)
    }

    fun setupObjectToolsMenu() {
        val btnObjectTools = activity.findViewById<TextView>(R.id.btnObjectTools)
        val objectToolsMenu = activity.findViewById<View>(R.id.objectToolsMenu)
        objectToolSelectionView = activity.findViewById(R.id.objectToolSelection)

        fun setMenuVisible(visible: Boolean) {
            objectToolsMenu.visibility = if (visible) View.VISIBLE else View.GONE
            btnObjectTools.text = if (visible) "Objetos ^" else "Objetos v"
        }

        btnObjectTools.setOnClickListener {
            setMenuVisible(objectToolsMenu.visibility != View.VISIBLE)
        }

        fun bindItem(id: Int, action: () -> Unit) {
            activity.findViewById<TextView>(id).setOnClickListener {
                setMenuVisible(false)
                action()
            }
        }

        bindItem(R.id.itemToolPencil) { toggleFreeDrawingMode("pencil", "Lapiz (dibujo libre)") }
        bindItem(R.id.itemToolEraser) { toggleFreeDrawingMode("eraser", "Goma de borrar") }
        bindItem(R.id.itemToolMil) { selectMapObjectTool(ObjectTool.MIL, "Simbolo Militar (MIL)") }
        bindItem(R.id.itemToolPoi) { selectMapObjectTool(ObjectTool.POI, "Puntos de Interes") }
        bindItem(R.id.itemToolPolygon) {
            polygonToolPoints.clear()
            selectMapObjectTool(ObjectTool.POLYGON, "Poligono Tactico")
            Toast.makeText(activity, "Toca 3 puntos en el mapa para cerrar el poligono.", Toast.LENGTH_LONG).show()
        }
        bindItem(R.id.itemToolCircle) { selectMapObjectTool(ObjectTool.CIRCLE, "Circulo de cobertura") }
        bindItem(R.id.itemToolRoute) {
            selectMapObjectTool(ObjectTool.ROUTE_START, "Linea Tactica (Ruta): origen")
            Toast.makeText(activity, "Toca el origen de la ruta.", Toast.LENGTH_SHORT).show()
        }
        bindItem(R.id.itemToolBuilding) { selectMapObjectTool(ObjectTool.BUILDING, "Edificio / Estructura") }
        bindItem(R.id.itemToolLabel) { selectMapObjectTool(ObjectTool.LABEL, "Etiqueta") }
    }

    override fun addMessage(msg: ChatMessage) {
        host.addMapMessage(msg)
    }

    override fun openChatPanel() {
        host.openMapChatPanel()
    }

    override fun isChatPanelActive(): Boolean =
        host.isMapChatPanelActive()

    override fun clearRouteOnBackend() {
        sendClearRouteToBackend()
    }

    override fun savePoi(
        lat: Double,
        lon: Double,
        nombre: String,
        tipoPoi: String,
        color: String,
        iconoSrc: String?
    ) {
        val operationId = host.getMapOperationId()
        if (operationId <= 0) return
        val token = host.getMapToken()
        if (token.isBlank()) return

        val currentUser = host.getMapCurrentUser()
        val tipoCreador = if (currentUser.tabla == "personal") "PERSONAL" else "USUARIO"
        val idKey = if (currentUser.tabla == "personal") "id_personal" else "id_usuario"
        val body = JSONObject()
            .put("nombre", nombre)
            .put("tipo_poi", tipoPoi)
            .put("latitud", lat)
            .put("longitud", lon)
            .put("color", color)
            .put("icono_src", iconoSrc ?: JSONObject.NULL)
            .put("sidc", iconoSrc?.takeIf { it.startsWith("S") } ?: JSONObject.NULL)
            .put("tipo_creador", tipoCreador)
            .put(idKey, currentUser.id)

        val request = Request.Builder()
            .url("${ApiConfig.BASE_URL}/ops/$operationId/pois")
            .addHeader("Authorization", "Bearer $token")
            .addHeader("Content-Type", "application/json")
            .post(body.toString().toRequestBody(JSON_MEDIA_TYPE))
            .build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("POI", "Error guardando POI en backend", e)
                activity.runOnUiThread {
                    host.addMapMessage(ChatMessage(user = "Sistema", text = "Error de conexion al guardar el POI.", type = MessageType.SYSTEM))
                }
            }

            override fun onResponse(call: Call, response: Response) {
                val responseBody = response.body?.string().orEmpty()
                Log.d("POI", "POI guardado: ${response.code} - $responseBody")

                if (response.isSuccessful && renderSavedPoi(responseBody, lat, lon, nombre, tipoPoi, color, iconoSrc)) {
                    return
                }

                if (!response.isSuccessful) {
                    val mensaje = runCatching {
                        JSONObject(responseBody).optString("mensaje", "No se pudo guardar el POI.")
                    }.getOrDefault("No se pudo guardar el POI.")

                    activity.runOnUiThread {
                        host.addMapMessage(ChatMessage(user = "Sistema", text = mensaje, type = MessageType.SYSTEM))
                    }
                }
            }
        })
    }

    fun sendClearRouteToBackend() {
        if (lastRouteId <= 0) return
        val operationId = host.getMapOperationId()
        if (operationId <= 0) return
        val token = host.getMapToken()
        if (token.isBlank()) return

        val request = Request.Builder()
            .url("${ApiConfig.BASE_URL}/ops/$operationId/rutas/navegacion/$lastRouteId")
            .addHeader("Authorization", "Bearer $token")
            .delete()
            .build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("RUTA_ANDROID", "Error limpiando ruta en backend", e)
            }

            override fun onResponse(call: Call, response: Response) {
                Log.d("RUTA_ANDROID", "Ruta limpiada: ${response.code}")
                lastRouteId = -1
            }
        })
    }

    fun loadDrawingsFromBackend(replace: Boolean = true) {
        val operationId = host.getMapOperationId()
        if (operationId <= 0) return
        val token = host.getMapToken()
        if (token.isBlank()) return

        drawingRepository.fetchDrawings(
            operationId = operationId,
            token = token,
            onSuccess = { items ->
                val arr = JSONArray()
                items.forEach { item ->
                    val localId = "draw_loaded_${item.optInt("id_dibujo")}"
                    drawingLocalToBackendId[localId] = item.optInt("id_dibujo")
                    val d = JSONObject()
                    d.put("id_dibujo", item.optInt("id_dibujo"))
                    d.put("color", item.optString("color", "#00ffa6"))
                    d.put("grosor", item.optDouble("grosor", 4.0))
                    val puntos = item.optJSONArray("puntos") ?: JSONArray()
                    val coords = JSONArray()
                    for (i in 0 until puntos.length()) {
                        val p = puntos.optJSONObject(i) ?: continue
                        coords.put(JSONObject().put("lat", p.optDouble("lat")).put("lng", p.optDouble("lng")))
                    }
                    d.put("coords", coords)
                    arr.put(d)
                }
                activity.runOnUiThread {
                    cesiumWebController.loadDrawings(arr.toString(), replace = replace)
                }
            },
            onError = { msg -> Log.w("DRAWING", "Error cargando dibujos: $msg") }
        )
    }

    fun onDrawingSavedFromBridge(strokeJson: String) {
        val operationId = host.getMapOperationId()
        if (operationId <= 0) return
        val token = host.getMapToken()
        if (token.isBlank()) return

        try {
            val stroke = JSONObject(strokeJson)
            val localId = stroke.optString("localId")
            val coords = stroke.optJSONArray("coords") ?: return
            val color = stroke.optString("color", "#00ffa6")
            val grosor = stroke.optDouble("grosor", 4.0)
            val currentUser = host.getMapCurrentUser()

            val userData = JSONObject().apply {
                put("tabla", if (currentUser.tabla == "personal") "personal" else "usuario")
                put("id_personal", currentUser.id)
                put("id_usuario", currentUser.id)
            }

            drawingRepository.saveDrawing(
                operationId = operationId,
                token = token,
                userData = userData,
                coords = coords,
                color = color,
                grosor = grosor,
                onSuccess = { idDibujo ->
                    if (localId.isNotBlank()) drawingLocalToBackendId[localId] = idDibujo
                    Log.d("DRAWING", "Trazo guardado id_dibujo=$idDibujo localId=$localId")
                },
                onError = { msg -> Log.w("DRAWING", "Error guardando trazo: $msg") }
            )
        } catch (e: Exception) {
            Log.e("DRAWING", "Error parseando strokeJson: ${e.message}")
        }
    }

    fun onDrawingDeletedFromBridge(localId: String) {
        val idDibujo = drawingLocalToBackendId[localId] ?: run {
            Log.w("DRAWING", "onDrawingDeleted: sin id_dibujo para localId=$localId")
            return
        }
        drawingLocalToBackendId.remove(localId)

        val operationId = host.getMapOperationId()
        if (operationId <= 0) return
        val token = host.getMapToken()
        if (token.isBlank()) return

        drawingRepository.deleteDrawing(
            operationId = operationId,
            idDibujo = idDibujo,
            token = token,
            onError = { msg -> Log.w("DRAWING", "Error borrando dibujo: $msg") }
        )
        Log.d("DRAWING", "Trazo eliminado id_dibujo=$idDibujo")
    }

    fun hasDrawingBackendId(idDibujo: Int): Boolean =
        drawingLocalToBackendId.containsValue(idDibujo)

    private fun deleteSelectedMapObject() {
        val selected = selectedMapObject ?: return
        val operationId = host.getMapOperationId()
        if (operationId <= 0) return

        when (selected.kind) {
            "poi" -> selected.id?.let { id ->
                deleteMapObjectFromBackend(
                    url = "${ApiConfig.BASE_URL}/ops/$operationId/pois/$id",
                    successMessage = "Punto eliminado.",
                    onSuccess = { cesiumWebController.removePoiFromMap(id) }
                )
            }
            "area" -> selected.id?.let { id ->
                deleteMapObjectFromBackend(
                    url = "${ApiConfig.BASE_URL}/ops/$operationId/areas/$id",
                    successMessage = "Area eliminada.",
                    onSuccess = { cesiumWebController.removeAreaFromMap(id) }
                )
            }
            "structure" -> selected.id?.let { id ->
                deleteMapObjectFromBackend(
                    url = "${ApiConfig.BASE_URL}/ops/$operationId/edificios/$id",
                    successMessage = "Estructura eliminada.",
                    onSuccess = { cesiumWebController.removeStructureFromMap(id) }
                )
            }
            "route" -> selected.id?.let { id ->
                deleteMapObjectFromBackend(
                    url = "${ApiConfig.BASE_URL}/ops/$operationId/rutas/navegacion/$id",
                    successMessage = "Ruta eliminada.",
                    onSuccess = {
                        cesiumWebController.evaluate("if(typeof removeRemoteRoute === 'function') removeRemoteRoute($id);")
                        if (lastRouteId == id) {
                            lastRouteId = -1
                            cesiumWebController.clearRoute()
                        }
                    }
                )
            }
            "tactical_route" -> selected.id?.let { id ->
                deleteMapObjectFromBackend(
                    url = "${ApiConfig.BASE_URL}/ops/$operationId/rutas/$id",
                    successMessage = "Linea tactica eliminada.",
                    onSuccess = { cesiumWebController.removeTacticalRouteFromMap(id) }
                )
            }
            "drawing" -> deleteSelectedDrawing(selected, operationId)
        }
    }

    private fun deleteSelectedDrawing(selected: SelectedMapObject, operationId: Int) {
        selected.localId?.let { localId ->
            cesiumWebController.evaluate("if(typeof removeDrawingByLocalId === 'function') removeDrawingByLocalId('${jsString(localId)}');")
            onDrawingDeletedFromBridge(localId)
            clearSelectedMapObject()
            Toast.makeText(activity, "Dibujo eliminado.", Toast.LENGTH_SHORT).show()
            return
        }

        val idDibujo = selected.id ?: return
        val token = host.getMapToken()
        if (token.isBlank()) return
        drawingRepository.deleteDrawing(
            operationId = operationId,
            idDibujo = idDibujo,
            token = token,
            onError = { msg ->
                activity.runOnUiThread {
                    host.addMapMessage(ChatMessage(user = "Sistema", text = msg, type = MessageType.SYSTEM))
                }
            }
        )
        cesiumWebController.removeDrawingFromMap(idDibujo)
        clearSelectedMapObject()
        Toast.makeText(activity, "Dibujo eliminado.", Toast.LENGTH_SHORT).show()
    }

    private fun deleteMapObjectFromBackend(
        url: String,
        successMessage: String,
        onSuccess: () -> Unit
    ) {
        val token = host.getMapToken()
        if (token.isBlank()) return

        val request = Request.Builder()
            .url(url)
            .addHeader("Authorization", "Bearer $token")
            .delete()
            .build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("MAP_DELETE", "Error eliminando objeto", e)
                activity.runOnUiThread {
                    host.addMapMessage(ChatMessage(user = "Sistema", text = "Error de conexion al eliminar el objeto.", type = MessageType.SYSTEM))
                }
            }

            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) {
                    activity.runOnUiThread {
                        host.addMapMessage(ChatMessage(user = "Sistema", text = "No se pudo eliminar el objeto.", type = MessageType.SYSTEM))
                    }
                    return
                }

                activity.runOnUiThread {
                    onSuccess()
                    clearSelectedMapObject()
                    Toast.makeText(activity, successMessage, Toast.LENGTH_SHORT).show()
                }
            }
        })
    }

    private fun sendRouteToBackend(payloadJson: String) {
        val operationId = host.getMapOperationId()
        Log.d("RUTA_ANDROID", "operationId actual: $operationId")
        if (operationId <= 0) {
            Log.e("RUTA_ANDROID", "No hay operacion activa valida para enviar ruta")
            return
        }

        val token = host.getMapToken()
        if (token.isBlank()) {
            Log.e("RUTA_ANDROID", "No hay token para enviar ruta")
            return
        }

        val request = Request.Builder()
            .url("${ApiConfig.BASE_URL}/ops/$operationId/rutas/navegacion")
            .addHeader("Authorization", "Bearer $token")
            .addHeader("Content-Type", "application/json")
            .post(payloadJson.toRequestBody(JSON_MEDIA_TYPE))
            .build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("RUTA_ANDROID", "Error enviando ruta al backend", e)
            }

            override fun onResponse(call: Call, response: Response) {
                val body = response.body?.string().orEmpty()
                Log.d("RUTA_ANDROID", "Respuesta backend ruta: ${response.code} - $body")

                if (response.isSuccessful) {
                    runCatching {
                        val json = JSONObject(body)
                        if (json.optBoolean("ok")) {
                            lastRouteId = json.optJSONObject("ruta")?.optInt("id_ruta", -1) ?: lastRouteId
                        }
                    }.onFailure { e ->
                        Log.e("RUTA_ANDROID", "Error parseando respuesta json de ruta", e)
                    }
                } else {
                    Log.e("RUTA_ANDROID", "Backend rechazo la ruta: $body")
                }
            }
        })
    }

    private fun renderSavedPoi(
        responseBody: String,
        lat: Double,
        lon: Double,
        nombre: String,
        tipoPoi: String,
        color: String,
        iconoSrc: String?
    ): Boolean = runCatching {
        val currentUser = host.getMapCurrentUser()
        val json = JSONObject(responseBody)
        val poi = json.optJSONObject("poi")
        if (!json.optBoolean("ok") || poi == null) return false

        val idPoi = poi.optInt("id_poi")
        val poiLat = poi.optDouble("latitud", lat)
        val poiLon = poi.optDouble("longitud", lon)
        val poiNombre = poi.optString("nombre", nombre)
        val poiTipo = poi.optString("tipo_poi", tipoPoi)
        val poiColor = poi.optString("color", color).ifBlank { color }
        val poiIconoRaw = if (poi.has("icono_src") && !poi.isNull("icono_src")) {
            poi.optString("icono_src")
        } else {
            iconoSrc.orEmpty()
        }
        val poiIconoSrc = resolvePoiIconUrl(poiIconoRaw)
        val poiSidc = if (poi.has("sidc") && !poi.isNull("sidc")) {
            poi.optString("sidc")
                .takeUnless { it.isBlank() || it.equals("null", ignoreCase = true) }
        } else {
            null
        }

        activity.runOnUiThread {
            if (idPoi > 0) {
                cesiumWebController.addPoiToMap(
                    idPoi = idPoi,
                    lat = poiLat,
                    lon = poiLon,
                    nombre = poiNombre,
                    tipoPoi = poiTipo,
                    color = poiColor,
                    iconoSrc = poiIconoSrc,
                    sidc = poiSidc
                )
            }

            val coord = "%.5f, %.5f".format(poiLat, poiLon)
            host.addMapMessage(
                ChatMessage(
                    user = currentUser.nombreCompleto,
                    text = "$poiNombre [$poiTipo] -> $coord",
                    type = MessageType.NORMAL
                )
            )
        }
        true
    }.getOrDefault(false)

    private fun toggleFreeDrawingMode(mode: String, label: String) {
        clearSelectedMapObject()
        selectedObjectTool = null
        polygonToolPoints.clear()

        if (drawingMode == mode) {
            stopFreeDrawingMode()
            updateObjectToolSelection(null)
            return
        }

        drawingMode = mode
        if (mode == "pencil") {
            cesiumWebController.startPencilMode()
            cesiumWebController.stopEraserMode()
        } else {
            cesiumWebController.startEraserMode()
            cesiumWebController.stopPencilMode()
        }
        updateObjectToolSelection(label)
        Toast.makeText(activity, "$label activo.", Toast.LENGTH_SHORT).show()
    }

    private fun stopFreeDrawingMode() {
        drawingMode = null
        cesiumWebController.stopPencilMode()
        cesiumWebController.stopEraserMode()
    }

    private fun selectMapObjectTool(tool: ObjectTool, label: String) {
        clearSelectedMapObject()
        stopFreeDrawingMode()
        selectedObjectTool = tool
        updateObjectToolSelection(label)
        Toast.makeText(activity, "$label: toca el mapa para colocar.", Toast.LENGTH_SHORT).show()
    }

    private fun clearSelectedObjectTool() {
        selectedObjectTool = null
        polygonToolPoints.clear()
        updateObjectToolSelection(null)
    }

    private fun updateObjectToolSelection(label: String?) {
        objectToolSelectionView?.text = label ?: "Selecciona herramienta..."
    }

    private fun handleSelectedObjectToolTap(lat: Double, lon: Double): Boolean =
        when (selectedObjectTool) {
            ObjectTool.MIL -> {
                clearSelectedObjectTool()
                mapActionController.showPoiCreationDialog(lat, lon, host.getMapCurrentUser().nombreCompleto, "MIL")
                true
            }
            ObjectTool.POI -> {
                clearSelectedObjectTool()
                mapActionController.showPoiCreationDialog(lat, lon, host.getMapCurrentUser().nombreCompleto, "PDI")
                true
            }
            ObjectTool.CIRCLE -> {
                clearSelectedObjectTool()
                showCoverageCircleDialog(lat, lon)
                true
            }
            ObjectTool.ROUTE_START -> {
                cesiumWebController.setRouteStart(lat, lon)
                selectedObjectTool = ObjectTool.ROUTE_END
                updateObjectToolSelection("Linea Tactica (Ruta): destino")
                Toast.makeText(activity, "Origen listo. Ahora toca el destino.", Toast.LENGTH_SHORT).show()
                true
            }
            ObjectTool.ROUTE_END -> {
                cesiumWebController.setRouteEnd(lat, lon)
                clearSelectedObjectTool()
                Toast.makeText(activity, "Ruta marcada.", Toast.LENGTH_SHORT).show()
                true
            }
            ObjectTool.BUILDING -> {
                clearSelectedObjectTool()
                showStructureDialog(lat, lon, "EDIFICIO", "Edificio / Estructura")
                true
            }
            ObjectTool.LABEL -> {
                clearSelectedObjectTool()
                showStructureDialog(lat, lon, "ETIQUETA", "Etiqueta")
                true
            }
            ObjectTool.POLYGON -> {
                polygonToolPoints.add(lat to lon)
                if (polygonToolPoints.size < 3) {
                    updateObjectToolSelection("Poligono: punto ${polygonToolPoints.size}/3")
                    Toast.makeText(activity, "Punto ${polygonToolPoints.size}/3 agregado.", Toast.LENGTH_SHORT).show()
                } else {
                    val points = polygonToolPoints.toList()
                    clearSelectedObjectTool()
                    savePolygonArea(points)
                }
                true
            }
            null -> false
        }

    private fun showCoverageCircleDialog(lat: Double, lon: Double) {
        val dp = (activity.resources.displayMetrics.density * 12).toInt()
        val layout = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp, dp / 2, dp, 0)
        }
        val inputName = EditText(activity).apply {
            hint = "Nombre"
            setText("Circulo de cobertura")
            selectAll()
        }
        val inputRadius = EditText(activity).apply {
            hint = "Radio en metros"
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
            setText("500")
        }
        layout.addView(inputName)
        layout.addView(inputRadius)

        AlertDialog.Builder(activity)
            .setTitle("Circulo de cobertura")
            .setView(layout)
            .setPositiveButton("Agregar") { _, _ ->
                val name = inputName.text.toString().trim().ifBlank { "Circulo de cobertura" }
                val radius = inputRadius.text.toString().toDoubleOrNull()?.coerceAtLeast(25.0) ?: 500.0
                saveCoverageCircle(lat, lon, name, radius)
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun showStructureDialog(lat: Double, lon: Double, tipoEstructura: String, defaultName: String) {
        val dp = (activity.resources.displayMetrics.density * 12).toInt()
        val inputName = EditText(activity).apply {
            hint = "Nombre"
            setText(defaultName)
            selectAll()
            setPadding(dp, 0, dp, 0)
        }

        AlertDialog.Builder(activity)
            .setTitle(defaultName)
            .setView(inputName)
            .setPositiveButton("Agregar") { _, _ ->
                val name = inputName.text.toString().trim().ifBlank { defaultName }
                saveStructure(lat, lon, name, tipoEstructura)
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun saveCoverageCircle(lat: Double, lon: Double, nombre: String, radiusMeters: Double) {
        saveArea(
            nombre = nombre,
            descripcion = "Circulo de cobertura",
            color = "#FF4500",
            geometry = JSONObject()
                .put("type", "Polygon")
                .put("coordinates", circleCoordinates(lat, lon, radiusMeters))
                .put(
                    "meta",
                    JSONObject()
                        .put("shape", "circle")
                        .put("center", JSONArray().put(lon).put(lat))
                        .put("radius_m", radiusMeters)
                        .put("opacity", 0.35)
                        .put("outline_width", 3)
                ),
            onSaved = { idArea ->
                cesiumWebController.addCoverageCircleToMap(idArea, lat, lon, radiusMeters, nombre, "#FF4500", 0.35, 3.0)
            }
        )
    }

    private fun savePolygonArea(points: List<Pair<Double, Double>>) {
        saveArea(
            nombre = "Poligono Tactico",
            descripcion = "Poligono tactico",
            color = "#FFD700",
            geometry = JSONObject()
                .put("type", "Polygon")
                .put("coordinates", polygonCoordinates(points))
                .put(
                    "meta",
                    JSONObject()
                        .put("shape", "polygon")
                        .put("opacity", 0.35)
                        .put("outline_width", 3)
                ),
            onSaved = { idArea ->
                cesiumWebController.addAreaPolygonToMap(idArea, "Poligono Tactico", buildPolygonPointsJson(points), "#FFD700", 0.35, 3.0)
            }
        )
    }

    private fun saveArea(
        nombre: String,
        descripcion: String,
        color: String,
        geometry: JSONObject,
        onSaved: (Int) -> Unit
    ) {
        val operationId = host.getMapOperationId()
        if (operationId <= 0) return
        val token = host.getMapToken()
        if (token.isBlank()) return

        val body = JSONObject()
            .put("nombre", nombre)
            .put("descripcion", descripcion)
            .put("color", color)
            .put("geometria", geometry)
        putCreatorPayload(body)

        val request = Request.Builder()
            .url("${ApiConfig.BASE_URL}/ops/$operationId/areas")
            .addHeader("Authorization", "Bearer $token")
            .addHeader("Content-Type", "application/json")
            .post(body.toString().toRequestBody(JSON_MEDIA_TYPE))
            .build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("AREA_ANDROID", "Error guardando area", e)
                activity.runOnUiThread {
                    host.addMapMessage(ChatMessage(user = "Sistema", text = "Error de conexion al guardar el area.", type = MessageType.SYSTEM))
                }
            }

            override fun onResponse(call: Call, response: Response) {
                val responseBody = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    activity.runOnUiThread {
                        host.addMapMessage(ChatMessage(user = "Sistema", text = "No se pudo guardar el area.", type = MessageType.SYSTEM))
                    }
                    return
                }

                val idArea = runCatching {
                    JSONObject(responseBody).optJSONObject("area")?.optInt("id_area", -1) ?: -1
                }.getOrDefault(-1)

                activity.runOnUiThread {
                    if (idArea > 0) {
                        onSaved(idArea)
                        Toast.makeText(activity, "$nombre colocado.", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        })
    }

    private fun saveStructure(lat: Double, lon: Double, nombre: String, tipoEstructura: String) {
        val operationId = host.getMapOperationId()
        if (operationId <= 0) return
        val token = host.getMapToken()
        if (token.isBlank()) return

        val body = JSONObject()
            .put("nombre", nombre)
            .put("tipo_estructura", tipoEstructura)
            .put("latitud", lat)
            .put("longitud", lon)
        putCreatorPayload(body)

        val request = Request.Builder()
            .url("${ApiConfig.BASE_URL}/ops/$operationId/edificios")
            .addHeader("Authorization", "Bearer $token")
            .addHeader("Content-Type", "application/json")
            .post(body.toString().toRequestBody(JSON_MEDIA_TYPE))
            .build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("ESTRUCTURA_ANDROID", "Error guardando estructura", e)
                activity.runOnUiThread {
                    host.addMapMessage(ChatMessage(user = "Sistema", text = "Error de conexion al guardar la estructura.", type = MessageType.SYSTEM))
                }
            }

            override fun onResponse(call: Call, response: Response) {
                val responseBody = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    val mensaje = runCatching {
                        JSONObject(responseBody).optString("mensaje", "No se pudo guardar la estructura.")
                    }.getOrDefault("No se pudo guardar la estructura.")
                    activity.runOnUiThread {
                        host.addMapMessage(ChatMessage(user = "Sistema", text = mensaje, type = MessageType.SYSTEM))
                    }
                    return
                }

                val structure = runCatching {
                    JSONObject(responseBody).optJSONObject("edificio")
                        ?: JSONObject(responseBody).optJSONObject("estructura")
                }.getOrNull()

                val idMarca = structure?.optInt("id_marca", -1) ?: -1
                val savedName = structure?.optString("nombre", nombre) ?: nombre
                val savedType = structure?.optString("tipo_estructura", tipoEstructura) ?: tipoEstructura
                val iconoSrc = resolveStructureIconUrl(savedType)

                activity.runOnUiThread {
                    if (idMarca > 0) {
                        cesiumWebController.addStructureToMap(idMarca, lat, lon, savedName, savedType, iconoSrc)
                        Toast.makeText(activity, "$savedName colocado.", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        })
    }

    private fun putCreatorPayload(body: JSONObject) {
        val currentUser = host.getMapCurrentUser()
        val tipoCreador = if (currentUser.tabla == "personal") "PERSONAL" else "USUARIO"
        val idKey = if (currentUser.tabla == "personal") "id_personal" else "id_usuario"
        body.put("tipo_creador", tipoCreador)
        body.put(idKey, currentUser.id)
    }

    private fun circleCoordinates(lat: Double, lon: Double, radiusMeters: Double): JSONArray {
        val earthRadius = 6378137.0
        val distance = radiusMeters / earthRadius
        val latRad = Math.toRadians(lat)
        val lonRad = Math.toRadians(lon)
        val ring = JSONArray()

        for (i in 0..64) {
            val bearing = 2.0 * PI * i / 64.0
            val pointLat = asin(
                sin(latRad) * cos(distance) +
                    cos(latRad) * sin(distance) * cos(bearing)
            )
            val pointLon = lonRad + atan2(
                sin(bearing) * sin(distance) * cos(latRad),
                cos(distance) - sin(latRad) * sin(pointLat)
            )
            ring.put(JSONArray().put(Math.toDegrees(pointLon)).put(Math.toDegrees(pointLat)))
        }

        return JSONArray().put(ring)
    }

    private fun polygonCoordinates(points: List<Pair<Double, Double>>): JSONArray {
        val ring = JSONArray()
        points.forEach { (lat, lon) ->
            ring.put(JSONArray().put(lon).put(lat))
        }
        points.firstOrNull()?.let { (lat, lon) ->
            ring.put(JSONArray().put(lon).put(lat))
        }
        return JSONArray().put(ring)
    }

    private fun buildPolygonPointsJson(points: List<Pair<Double, Double>>): String =
        buildString {
            append("[")
            points.forEachIndexed { index, point ->
                if (index > 0) append(",")
                append("{")
                append("\"lat\":${point.first},")
                append("\"lon\":${point.second}")
                append("}")
            }
            append("]")
        }

    private fun resolvePoiIconUrl(iconoSrc: String?): String? {
        val cleaned = iconoSrc?.trim()
        if (cleaned.isNullOrBlank() || cleaned.equals("null", ignoreCase = true)) return null
        if (cleaned.startsWith("S")) return cleaned
        if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) return cleaned
        return "${ApiConfig.BASE_URL}/${cleaned.trimStart('/')}"
    }

    private fun resolveStructureIconUrl(tipoEstructura: String?): String? {
        val tipo = tipoEstructura?.trim()?.uppercase().orEmpty()
        return if (tipo == "ETIQUETA") null else "${ApiConfig.BASE_URL}/img/estructuras/casa.png"
    }

    private fun jsString(value: String): String =
        value
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", " ")
            .replace("\r", " ")

    private companion object {
        val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    }
}
