package com.operaciones.operaciones_android.wear

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import com.operaciones.operaciones_android.auth.AuthManager
import com.operaciones.operaciones_android.ui.LoginActivity
import com.operaciones.operaciones_android.ui.MainActivity
import com.operaciones.operaciones_android.ui.OperationStatusActivity
import org.json.JSONObject

class PhoneWearListenerService : WearableListenerService() {
    companion object {
        private const val TAG = "PhoneWearListener"
        private const val PATH_OPEN_PHONE = "/sedam/open-phone"
        private const val PATH_EMERGENCY = "/sedam/emergency"
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        when (messageEvent.path) {
            PATH_OPEN_PHONE -> openPhone(messageEvent)
            PATH_EMERGENCY -> mirrorEmergency(messageEvent)
            else -> super.onMessageReceived(messageEvent)
        }
    }

    private fun openPhone(messageEvent: MessageEvent) {
        val payload = parsePayload(messageEvent)
        val user = AuthManager.getCurrentUser(this)
        val intent = when {
            user == null -> Intent(this, LoginActivity::class.java)
            payload.optString("op_estado", "ACTIVA").uppercase() == "ACTIVA" ->
                Intent(this, MainActivity::class.java).apply {
                    putExtra("USER_ID", user.id)
                    putOperationExtras(payload)
                }
            else ->
                Intent(this, OperationStatusActivity::class.java).apply {
                    putExtra("USER_ID", user.id)
                    putOperationExtras(payload)
                }
        }

        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        runCatching { startActivity(intent) }
            .onFailure { Log.e(TAG, "No se pudo abrir telefono desde Wear", it) }
    }

    private fun mirrorEmergency(messageEvent: MessageEvent) {
        val payload = parsePayload(messageEvent)
        Log.w(TAG, "SOS recibido desde reloj: $payload")
        val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 300, 120, 300), -1))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(longArrayOf(0, 300, 120, 300), -1)
        }
    }

    private fun Intent.putOperationExtras(payload: JSONObject) {
        putExtra("OPERATION_ID", payload.optInt("operation_id", -1))
        putExtra("OP_ESTADO", payload.optString("op_estado", "ACTIVA"))
        putExtra("OP_CODIGO", payload.optString("op_codigo", ""))
        putExtra("OP_NOMBRE", payload.optString("op_nombre", "Operacion"))
        putExtra("OP_DESCRIPCION", payload.optString("op_descripcion", ""))
        putExtra("OP_PRIORIDAD", payload.optString("op_prioridad", "MEDIA"))
        putExtra("OP_FECHA_INICIO", payload.optString("op_fecha_inicio", ""))
        putExtra("OP_FECHA_FIN", payload.optString("op_fecha_fin", ""))
        putExtra("OP_LAT", payload.optDouble("op_lat", 0.0))
        putExtra("OP_LON", payload.optDouble("op_lon", 0.0))
        putExtra("OP_ZOOM", payload.optInt("op_zoom", 8000))
    }

    private fun parsePayload(messageEvent: MessageEvent): JSONObject =
        runCatching { JSONObject(String(messageEvent.data, Charsets.UTF_8)) }
            .getOrElse { JSONObject() }
}
