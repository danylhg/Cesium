package com.operaciones.operaciones_android.webview

import android.webkit.JavascriptInterface
import com.operaciones.operaciones_android.model.ChatMessage
import com.operaciones.operaciones_android.model.MessageType
import com.operaciones.operaciones_android.ui.MainActivity

class MainJsBridge(
    private val activity: MainActivity
) {

    @JavascriptInterface
    fun onMapTapped(lat: Double, lon: Double) {
        activity.runOnUiThread {
            activity.showMapActionDialogFromBridge(lat, lon)
        }
    }

    @JavascriptInterface
    fun onMapObjectSelected(payloadJson: String) {
        activity.runOnUiThread {
            activity.onMapObjectSelectedFromBridge(payloadJson)
        }
    }

    @JavascriptInterface
    fun onMapSelectionCleared() {
        activity.runOnUiThread {
            activity.clearSelectedMapObject()
        }
    }

    @JavascriptInterface
    fun sendTrafficAlert(message: String) {
        activity.runOnUiThread {
            if (message == "Mapa listo") {
                activity.applyOperationViewFromBridge()
            } else {
                activity.addMessage(
                    ChatMessage(user = "Sistema", text = message, type = MessageType.SYSTEM)
                )
            }
        }
    }

    @JavascriptInterface
    fun requestLocation() {
        activity.requestLocationPermissionFromBridge()
    }

    @JavascriptInterface
    fun getUserRole(): String = activity.getCurrentUserRoleForBridge()

    @JavascriptInterface
    fun getOperationName(): String = activity.getCurrentOperationNameForBridge()

    @JavascriptInterface
    fun getOperationId(): Int = activity.getCurrentOperationIdForBridge()

    @JavascriptInterface
    fun onRouteCreated(payloadJson: String) {
        activity.runOnUiThread {
            activity.onRouteCreatedFromBridge(payloadJson)
        }
    }

    @JavascriptInterface
    fun onDrawingSaved(strokeJson: String) {
        activity.onDrawingSavedFromBridge(strokeJson)
    }

    @JavascriptInterface
    fun onDrawingDeleted(localId: String) {
        activity.onDrawingDeletedFromBridge(localId)
    }
}
