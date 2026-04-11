package com.operaciones.operaciones_android.webview

import android.annotation.SuppressLint
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

class CesiumWebController(
    private val webView: WebView,
    private val jsBridge: Any,
    private val opLat: Double,
    private val opLon: Double,
    private val opZoom: Int
) {
    private var isPageReady: Boolean = false
    private var pendingMyPosition: Pair<Double, Double>? = null

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

    fun loadPois(poisJson: String) {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof loadPois === 'function') {
                        loadPois($poisJson);
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

    fun loadStructures(structuresJson: String) {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof loadStructures === 'function') {
                        loadStructures($structuresJson);
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

    fun addPoiToMap(idPoi: Int, lat: Double, lon: Double, nombre: String, tipoPoi: String, color: String, iconoSrc: String? = null) {
        val safeNombre = nombre.replace("'", "\\'")
        val safeTipo = tipoPoi.replace("'", "\\'")
        val safeColor = color.replace("'", "\\'")
        val iconArg = iconoSrc?.replace("'", "\\'")?.let { "'$it'" } ?: "null"
        android.util.Log.d(
            "POI_ANDROID",
            "addPoiToMap id=$idPoi tipo=$tipoPoi color=$color icono=${iconoSrc ?: "null"} lat=$lat lon=$lon nombre=$nombre"
        )
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof addPoiToMap === 'function') {
                        addPoiToMap($idPoi, $lat, $lon, '$safeNombre', '$safeTipo', '$safeColor', $iconArg);
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

    fun evaluate(js: String) {
        webView.post {
            webView.evaluateJavascript(js, null)
        }
    }
}
