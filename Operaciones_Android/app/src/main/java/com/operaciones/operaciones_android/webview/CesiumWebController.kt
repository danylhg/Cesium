package com.operaciones.operaciones_android.webview

import android.annotation.SuppressLint
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.view.MotionEvent
import android.view.ViewConfiguration
import kotlin.math.abs

class CesiumWebController(
    private val webView: WebView,
    private val jsBridge: Any,
    private val opLat: Double,
    private val opLon: Double,
    private val opZoom: Int
) {
    private var isPageReady: Boolean = false
    private var pendingMyPosition: Pair<Double, Double>? = null
    private var touchDownX: Float? = null
    private var touchDownY: Float? = null

    @SuppressLint("SetJavaScriptEnabled")
    fun setup() {
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            allowFileAccessFromFileURLs = true
            allowUniversalAccessFromFileURLs = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            loadWithOverviewMode = true
            useWideViewPort = true
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                android.util.Log.d(
                    "CesiumJS",
                    "${msg.message()} | line=${msg.lineNumber()} | source=${msg.sourceId()}"
                )
                return true
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                isPageReady = true
                applyOperationView()
                pendingMyPosition?.let { (lat, lon) ->
                    updateMyPosition(lat, lon)
                }
            }
        }

        val tapSlop = ViewConfiguration.get(webView.context).scaledTouchSlop
        webView.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    touchDownX = event.x
                    touchDownY = event.y
                }
                MotionEvent.ACTION_CANCEL -> {
                    touchDownX = null
                    touchDownY = null
                }
                MotionEvent.ACTION_UP -> {
                    val downX = touchDownX
                    val downY = touchDownY
                    touchDownX = null
                    touchDownY = null
                    if (
                        downX != null &&
                        downY != null &&
                        abs(event.x - downX) <= tapSlop &&
                        abs(event.y - downY) <= tapSlop &&
                        webView.width > 0 &&
                        webView.height > 0
                    ) {
                        tapMapAtRatio(
                            xRatio = event.x / webView.width,
                            yRatio = event.y / webView.height
                        )
                    }
                }
            }
            false
        }

        webView.addJavascriptInterface(jsBridge, "Android")
        webView.loadUrl("file:///android_asset/map.html")
    }

    fun applyOperationView() {
        if (opLat != 0.0 && opLon != 0.0) {
            setOperationView(opLat, opLon, opZoom)
        }
    }

    fun setOperationView(lat: Double, lon: Double, zoom: Int) {
        webView.postDelayed({
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof setOperationView === 'function') {
                        setOperationView($lat, $lon, $zoom);
                        return 'OK';
                    }
                    return 'ERROR:setOperationView no existe';
                })();
                """.trimIndent(),
                null
            )
        }, 2500)
    }

    fun updateMyPosition(latitude: Double, longitude: Double) {
        pendingMyPosition = latitude to longitude
        if (!isPageReady) return
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof updateMyPosition === 'function') {
                        updateMyPosition($latitude, $longitude);
                        return 'OK';
                    }
                    return 'ERROR:updateMyPosition no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun centerOnLocation(latitude: Double, longitude: Double, zoom: Int = 250, follow: Boolean = false) {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof centerOnLocation === 'function') {
                        centerOnLocation($latitude, $longitude, $zoom, $follow);
                        return 'OK';
                    }
                    if (typeof setOperationView === 'function') {
                        setOperationView($latitude, $longitude, $zoom);
                        return 'OK';
                    }
                    return 'ERROR:centerOnLocation no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun setBaseLayer(key: String) {
        val safeKey = key.replace("'", "\\'")
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof setBaseLayer === 'function') {
                        setBaseLayer('$safeKey');
                        return 'OK';
                    }
                    return 'ERROR:setBaseLayer no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    private fun tapMapAtRatio(xRatio: Float, yRatio: Float) {
        if (!isPageReady) return
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof tapMapAtViewportRatio === 'function') {
                        tapMapAtViewportRatio($xRatio, $yRatio);
                        return 'OK';
                    }
                    return 'ERROR:tapMapAtViewportRatio no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun selectTrackingPersonal(idPersonal: Int) {
        webView.post {
            webView.evaluateJavascript(
                "(function(){ if(typeof selectTrackingPersonal==='function') selectTrackingPersonal($idPersonal); })();",
                null
            )
        }
    }

    fun followTrackingPersonal(idPersonal: Int, latitude: Double, longitude: Double, zoom: Int = 500) {
        webView.post {
            webView.evaluateJavascript(
                """
                (function(){
                    if (typeof followTrackingPersonal === 'function') {
                        followTrackingPersonal($idPersonal, $latitude, $longitude, $zoom);
                        return 'OK';
                    }
                    if (typeof selectTrackingPersonal === 'function') {
                        selectTrackingPersonal($idPersonal);
                    }
                    if (typeof centerOnLocation === 'function') {
                        centerOnLocation($latitude, $longitude, $zoom, false);
                    }
                    return 'OK';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun clearTrackingSelection() {
        webView.post {
            webView.evaluateJavascript(
                "(function(){ if(typeof clearTrackingSelection==='function') clearTrackingSelection(); })();",
                null
            )
        }
    }

    fun pulseEmergencyPersonal(idPersonal: Int) {
        webView.post {
            webView.evaluateJavascript(
                "(function(){ if(typeof pulseEmergencyPersonal==='function') pulseEmergencyPersonal($idPersonal); })();",
                null
            )
        }
    }

    fun pulseEmergencyAtLocation(idPersonal: Int, latitude: Double, longitude: Double) {
        webView.post {
            webView.evaluateJavascript(
                "(function(){ if(typeof pulseEmergencyAtLocation==='function') pulseEmergencyAtLocation($idPersonal, $latitude, $longitude); })();",
                null
            )
        }
    }

    fun enablePickStart() {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof enablePickStart === 'function') {
                        enablePickStart();
                        return 'OK';
                    }
                    return 'ERROR:enablePickStart no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun enablePickEnd() {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof enablePickEnd === 'function') {
                        enablePickEnd();
                        return 'OK';
                    }
                    return 'ERROR:enablePickEnd no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun calculateRoute() {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof calculateRoute === 'function') {
                        calculateRoute();
                        return 'OK';
                    }
                    return 'ERROR:calculateRoute no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun setRouteStart(latitude: Double, longitude: Double) {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof setRouteStart === 'function') {
                        setRouteStart($latitude, $longitude);
                        return 'OK';
                    }
                    return 'ERROR:setRouteStart no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun setRouteEnd(latitude: Double, longitude: Double) {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof setRouteEnd === 'function') {
                        setRouteEnd($latitude, $longitude);
                        return 'OK';
                    }
                    return 'ERROR:setRouteEnd no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun clearRoute() {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof clearRoute === 'function') {
                        clearRoute();
                        return 'OK';
                    }
                    return 'ERROR:clearRoute no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun loadPois(poisJson: String, replace: Boolean = false) {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof loadPois === 'function') {
                        loadPois($poisJson, $replace);
                        return 'OK';
                    }
                    return 'ERROR:loadPois no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun loadCoverageCircles(circlesJson: String) {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof loadCoverageCircles === 'function') {
                        loadCoverageCircles($circlesJson);
                        return 'OK';
                    }
                    return 'ERROR:loadCoverageCircles no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun loadAreaPolygons(polygonsJson: String) {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof loadAreaPolygons === 'function') {
                        loadAreaPolygons($polygonsJson);
                        return 'OK';
                    }
                    return 'ERROR:loadAreaPolygons no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun syncAreas(circlesJson: String, polygonsJson: String) {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof syncAreas === 'function') {
                        syncAreas($circlesJson, $polygonsJson);
                        return 'OK';
                    }
                    if (typeof loadCoverageCircles === 'function') loadCoverageCircles($circlesJson);
                    if (typeof loadAreaPolygons === 'function') loadAreaPolygons($polygonsJson);
                    return 'OK';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun loadStructures(structuresJson: String, replace: Boolean = false) {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof loadStructures === 'function') {
                        loadStructures($structuresJson, $replace);
                        return 'OK';
                    }
                    return 'ERROR:loadStructures no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun loadOperationZone(zoneJson: String) {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof loadOperationZone === 'function') {
                        loadOperationZone($zoneJson);
                        return 'OK';
                    }
                    return 'ERROR:loadOperationZone no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun loadOperationGrid(gridJson: String) {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof loadOperationGrid === 'function') {
                        loadOperationGrid($gridJson);
                        return 'OK';
                    }
                    return 'ERROR:loadOperationGrid no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun clearOperationGrid() {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof clearOperationGrid === 'function') {
                        clearOperationGrid();
                        return 'OK';
                    }
                    return 'ERROR:clearOperationGrid no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun addPoiToMap(idPoi: Int, lat: Double, lon: Double, nombre: String, tipoPoi: String, color: String, iconoSrc: String? = null, sidc: String? = null) {
        val safeNombre = nombre.replace("'", "\\'")
        val safeTipo = tipoPoi.replace("'", "\\'")
        val safeColor = color.replace("'", "\\'")
        val iconArg = iconoSrc?.replace("'", "\\'")?.let { "'$it'" } ?: "null"
        val sidcArg = sidc?.replace("'", "\\'")?.let { "'$it'" } ?: "null"
        android.util.Log.d(
            "POI_ANDROID",
            "addPoiToMap id=$idPoi tipo=$tipoPoi color=$color icono=${iconoSrc ?: "null"} sidc=${sidc ?: "null"} lat=$lat lon=$lon nombre=$nombre"
        )
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof addPoiToMap === 'function') {
                        addPoiToMap($idPoi, $lat, $lon, '$safeNombre', '$safeTipo', '$safeColor', $iconArg, $sidcArg);
                        return 'OK';
                    }
                    return 'ERROR:addPoiToMap no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun addStructureToMap(idMarca: Int, lat: Double, lon: Double, nombre: String, tipoEstructura: String, iconoSrc: String? = null) {
        val safeNombre = nombre.replace("'", "\\'")
        val safeTipo = tipoEstructura.replace("'", "\\'")
        val iconArg = iconoSrc?.replace("'", "\\'")?.let { "'$it'" } ?: "null"
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof addStructureToMap === 'function') {
                        addStructureToMap($idMarca, $lat, $lon, '$safeNombre', '$safeTipo', $iconArg);
                        return 'OK';
                    }
                    return 'ERROR:addStructureToMap no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun removePoiFromMap(idPoi: Int) {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof removePoiFromMap === 'function') {
                        removePoiFromMap($idPoi);
                        return 'OK';
                    }
                    return 'ERROR:removePoiFromMap no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun removeStructureFromMap(idMarca: Int) {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof removeStructureFromMap === 'function') {
                        removeStructureFromMap($idMarca);
                        return 'OK';
                    }
                    return 'ERROR:removeStructureFromMap no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun addCoverageCircleToMap(
        idArea: Int,
        centerLat: Double,
        centerLon: Double,
        radiusM: Double,
        nombre: String,
        color: String,
        opacity: Double,
        outlineWidth: Double
    ) {
        val safeNombre = nombre.replace("'", "\\'")
        val safeColor = color.replace("'", "\\'")
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof addCoverageCircleToMap === 'function') {
                        addCoverageCircleToMap($idArea, $centerLat, $centerLon, $radiusM, '$safeNombre', '$safeColor', $opacity, $outlineWidth);
                        return 'OK';
                    }
                    return 'ERROR:addCoverageCircleToMap no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun addAreaPolygonToMap(
        idArea: Int,
        nombre: String,
        pointsJson: String,
        color: String,
        opacity: Double,
        outlineWidth: Double
    ) {
        val safeNombre = nombre.replace("'", "\\'")
        val safeColor = color.replace("'", "\\'")
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof addAreaPolygonToMap === 'function') {
                        addAreaPolygonToMap($idArea, '$safeNombre', $pointsJson, '$safeColor', $opacity, $outlineWidth);
                        return 'OK';
                    }
                    return 'ERROR:addAreaPolygonToMap no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun removeCoverageCircleFromMap(idArea: Int) {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof removeCoverageCircleFromMap === 'function') {
                        removeCoverageCircleFromMap($idArea);
                        return 'OK';
                    }
                    return 'ERROR:removeCoverageCircleFromMap no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun removeAreaFromMap(idArea: Int) {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof removeAreaFromMap === 'function') {
                        removeAreaFromMap($idArea);
                        return 'OK';
                    }
                    return 'ERROR:removeAreaFromMap no existe';
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun startPencilMode() {
        webView.post {
            webView.evaluateJavascript(
                "(function(){ if(typeof startPencilMode==='function') startPencilMode(); })();",
                null
            )
        }
    }

    fun stopPencilMode() {
        webView.post {
            webView.evaluateJavascript(
                "(function(){ if(typeof stopPencilMode==='function') stopPencilMode(); })();",
                null
            )
        }
    }

    fun startEraserMode() {
        webView.post {
            webView.evaluateJavascript(
                "(function(){ if(typeof startEraserMode==='function') startEraserMode(); })();",
                null
            )
        }
    }

    fun stopEraserMode() {
        webView.post {
            webView.evaluateJavascript(
                "(function(){ if(typeof stopEraserMode==='function') stopEraserMode(); })();",
                null
            )
        }
    }

    fun loadRemoteRoutes(routesJson: String, replace: Boolean = false) {
        webView.post {
            webView.evaluateJavascript(
                "(function(){ if(typeof loadRemoteRoutes==='function') loadRemoteRoutes($routesJson, $replace); })();",
                null
            )
        }
    }

    fun loadTacticalRoutes(routesJson: String, replace: Boolean = false) {
        webView.post {
            webView.evaluateJavascript(
                "(function(){ if(typeof loadTacticalRoutes==='function') loadTacticalRoutes($routesJson, $replace); })();",
                null
            )
        }
    }

    fun removeTacticalRouteFromMap(idRuta: Int) {
        webView.post {
            webView.evaluateJavascript(
                "(function(){ if(typeof removeTacticalRouteFromMap==='function') removeTacticalRouteFromMap($idRuta); })();",
                null
            )
        }
    }

    fun loadDrawings(drawingsJson: String, replace: Boolean = false) {
        webView.post {
            webView.evaluateJavascript(
                "(function(){ if(typeof loadDrawings==='function') loadDrawings($drawingsJson, $replace); })();",
                null
            )
        }
    }

    fun removeDrawingFromMap(idDibujo: Int) {
        webView.post {
            webView.evaluateJavascript(
                "(function(){ if(typeof removeDrawingFromMap==='function') removeDrawingFromMap($idDibujo); })();",
                null
            )
        }
    }

    fun resize() {
        webView.postDelayed({
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof resizeCesium === 'function') {
                        resizeCesium();
                        return 'OK';
                    }
                    return 'ERROR:resizeCesium no existe';
                })();
                """.trimIndent(),
                null
            )
        }, 150)
    }

    fun evaluate(js: String) {
        webView.post {
            webView.evaluateJavascript(js, null)
        }
    }
}
