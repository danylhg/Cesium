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
                applyOperationView()
            }
        }

        webView.addJavascriptInterface(jsBridge, "Android")
        webView.loadUrl("file:///android_asset/map.html")
    }

    fun applyOperationView() {
        if (opLat != 0.0 && opLon != 0.0) {
            webView.postDelayed({
                webView.evaluateJavascript(
                    """
                    (function() {
                        if (typeof setOperationView === 'function') {
                            setOperationView($opLat, $opLon, $opZoom);
                            return 'OK';
                        }
                        return 'ERROR:setOperationView no existe';
                    })();
                    """.trimIndent(),
                    null
                )
            }, 2500)
        }
    }

    fun updateMyPosition(latitude: Double, longitude: Double) {
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    if (typeof updateMyPosition === 'function') {
                        updateMyPosition($latitude, $longitude);
                    }
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun evaluate(js: String) {
        webView.evaluateJavascript(js, null)
    }
}