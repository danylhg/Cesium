package com.operaciones.operaciones_android

import android.content.Context
import android.webkit.JavascriptInterface
import android.util.Log

class JsBridge(private val context: Context) {

    @JavascriptInterface
    fun onMapTapped(lat: Double, lon: Double) {
        Log.d("Cesium", "Tapped at: $lat, $lon")
    }

    @JavascriptInterface
    fun sendAlert(message: String) {
        Log.d("Cesium", "Alert: $message")
    }
}