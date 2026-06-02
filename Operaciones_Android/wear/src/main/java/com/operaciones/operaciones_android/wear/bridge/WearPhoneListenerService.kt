package com.operaciones.operaciones_android.wear.bridge

import android.util.Log
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject

class WearPhoneListenerService : WearableListenerService() {
    override fun onMessageReceived(messageEvent: MessageEvent) {
        if (messageEvent.path != WearPhoneSessionSync.PATH_SESSION_SYNC) {
            super.onMessageReceived(messageEvent)
            return
        }

        runCatching {
            val payload = JSONObject(String(messageEvent.data, Charsets.UTF_8))
            WearPhoneSessionSync.apply(this, payload)
        }.onFailure {
            Log.e("WearPhoneListener", "No se pudo aplicar sesion del telefono", it)
        }
    }
}
