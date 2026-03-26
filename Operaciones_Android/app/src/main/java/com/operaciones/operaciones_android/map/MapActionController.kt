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
        val author = currentUser.nombreCompleto

        val actions = mutableListOf<Pair<String, () -> Unit>>()

        actions += "🟢 Usar como origen de ruta" to {
            cesiumWebController.setRouteStart(lat, lon)
        }

        actions += "🟡 Usar como destino de ruta" to {
            cesiumWebController.setRouteEnd(lat, lon)
        }

        actions += "🧹 Limpiar ruta" to {
            cesiumWebController.clearRoute()
            (host as? com.operaciones.operaciones_android.ui.MainActivity)?.sendClearRouteToBackend()
        }

        actions += "📍 Punto de interés" to {
            cesiumWebController.evaluate(
                "if (typeof addPointOfInterest === 'function') addPointOfInterest($lat, $lon, 'PDI', '$author');"
            )
            host.addMessage(
                ChatMessage(
                    user = author,
                    text = "📍 PDI agregado → $coord",
                    type = MessageType.NORMAL
                )
            )
        }

        actions += "🔴 Área de interés" to {
            cesiumWebController.evaluate(
                "if (typeof addAreaOfInterest === 'function') addAreaOfInterest($lat, $lon, '$author');"
            )
            host.addMessage(
                ChatMessage(
                    user = author,
                    text = "🔴 Área marcada → $coord",
                    type = MessageType.NORMAL
                )
            )
        }

        if (currentUser.puedeAsignarEstructuras) {
            actions += "🏗️ Estructura táctica" to {
                cesiumWebController.evaluate(
                    "if (typeof addTacticalStructure === 'function') addTacticalStructure($lat, $lon, '$author');"
                )
                host.addMessage(
                    ChatMessage(
                        user = author,
                        text = "🏗️ Estructura → $coord",
                        type = MessageType.NORMAL
                    )
                )
            }
        }

        actions += "🚨 Aviso de posición" to {
            host.addMessage(
                ChatMessage(
                    user = "⚠️ $author",
                    text = "Aviso de posición → $coord",
                    type = MessageType.ALERT
                )
            )
        }

        AlertDialog.Builder(host as android.content.Context)
            .setTitle("Agregar en $coord")
            .setItems(actions.map { it.first }.toTypedArray()) { _, which ->
                actions[which].second.invoke()
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }
}