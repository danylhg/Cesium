package com.operaciones.operaciones_android.map

import androidx.appcompat.app.AlertDialog
import com.operaciones.operaciones_android.model.ChatMessage
import com.operaciones.operaciones_android.model.MessageType
import com.operaciones.operaciones_android.model.User
import com.operaciones.operaciones_android.webview.CesiumWebController

class MapActionController(
    private val host: Host,
    private val cesiumWebController: CesiumWebController
) {

    interface Host {
        fun addMessage(msg: ChatMessage)
        fun openChatPanel()
        fun isChatPanelActive(): Boolean
    }

    fun showMapActionDialog(
        currentUser: User,
        lat: Double,
        lon: Double
    ) {
        val coord = "%.5f, %.5f".format(lat, lon)

        val options = buildList {
            add("📍  Punto de interés")
            add("🔴  Área de interés")
            if (currentUser.puedeAsignarEstructuras) add("🏗️  Estructura táctica")
            add("🚨  Aviso de posición")
        }

        AlertDialog.Builder(host as android.content.Context)
            .setTitle("Agregar en $coord")
            .setItems(options.toTypedArray()) { _, i ->
                val author = currentUser.nombreCompleto

                when {
                    i == 0 -> {
                        cesiumWebController.evaluate(
                            "if (typeof addPointOfInterest === 'function') addPointOfInterest($lat, $lon, 'PDI', '$author');"
                        )
                        host.addMessage(
                            ChatMessage(author, "📍 PDI agregado → $coord", MessageType.NORMAL)
                        )
                    }

                    i == 1 -> {
                        cesiumWebController.evaluate(
                            "if (typeof addAreaOfInterest === 'function') addAreaOfInterest($lat, $lon, '$author');"
                        )
                        host.addMessage(
                            ChatMessage(author, "🔴 Área marcada → $coord", MessageType.NORMAL)
                        )
                    }

                    i == 2 && currentUser.puedeAsignarEstructuras -> {
                        cesiumWebController.evaluate(
                            "if (typeof addTacticalStructure === 'function') addTacticalStructure($lat, $lon, '$author');"
                        )
                        host.addMessage(
                            ChatMessage(author, "🏗️ Estructura → $coord", MessageType.NORMAL)
                        )
                    }

                    else -> {
                        host.addMessage(
                            ChatMessage("⚠️ $author", "Aviso de posición → $coord", MessageType.ALERT)
                        )
                    }
                }

                if (!host.isChatPanelActive()) {
                    host.openChatPanel()
                }
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }
}