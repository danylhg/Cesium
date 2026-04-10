package com.operaciones.operaciones_android.map

import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import com.operaciones.operaciones_android.model.ChatMessage
import com.operaciones.operaciones_android.model.MessageType
import com.operaciones.operaciones_android.model.User
import com.operaciones.operaciones_android.model.UserRole
import com.operaciones.operaciones_android.webview.CesiumWebController

class MapActionController(
    private val host: Host,
    private val cesiumWebController: CesiumWebController
) {

    companion object {
        val COLORES_POI = listOf(
            "Amarillo"  to "#FFD700",
            "Rojo"      to "#FF4500",
            "Azul"      to "#00BFFF",
            "Verde"     to "#00FF88",
            "Naranja"   to "#FF8C00",
            "Blanco"    to "#FFFFFF",
            "Morado"    to "#9400D3",
            "Rosa"      to "#FF69B4"
        )

        val TIPOS_POI = listOf(
            "PDI" to "Punto de Interés",
            "MIL" to "Símbolo Militar"
        )
    }

    interface Host {
        fun addMessage(msg: ChatMessage)
        fun openChatPanel()
        fun isChatPanelActive(): Boolean
        fun savePoi(lat: Double, lon: Double, nombre: String, tipoPoi: String, color: String)
    }

    fun showMapActionDialog(
        currentUser: User,
        lat: Double,
        lon: Double
    ) {
        val coord = "%.5f, %.5f".format(lat, lon)
        val author = currentUser.nombreCompleto

        val actions = mutableListOf<Pair<String, () -> Unit>>()

        if (currentUser.rol == UserRole.CET) {
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
        }

        actions += "📍 Punto de interés" to {
            showPoiCreationDialog(lat, lon, author)
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

    private fun showPoiCreationDialog(lat: Double, lon: Double, author: String) {
        val context = host as android.content.Context
        val dp8 = (8 * context.resources.displayMetrics.density).toInt()
        val dp4 = (4 * context.resources.displayMetrics.density).toInt()

        val layout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp8 * 2, dp8, dp8 * 2, dp8)
        }

        // Campo nombre
        val labelNombre = TextView(context).apply { text = "Nombre" }
        val inputNombre = EditText(context).apply { setText("PDI") }
        layout.addView(labelNombre)
        layout.addView(inputNombre)

        // Selector tipo POI
        val labelTipo = TextView(context).apply {
            text = "Tipo"
            setPadding(0, dp8, 0, dp4)
        }
        layout.addView(labelTipo)

        val radioGroupTipo = RadioGroup(context).apply { orientation = RadioGroup.HORIZONTAL }
        TIPOS_POI.forEachIndexed { idx, (codigo, etiqueta) ->
            RadioButton(context).apply {
                id = idx + 1
                text = etiqueta
                isChecked = idx == 0
                radioGroupTipo.addView(this)
            }
        }
        layout.addView(radioGroupTipo)

        // Selector color
        val labelColor = TextView(context).apply {
            text = "Color"
            setPadding(0, dp8, 0, dp4)
        }
        layout.addView(labelColor)

        val radioGroupColor = RadioGroup(context)
        COLORES_POI.forEachIndexed { idx, (nombre, _) ->
            RadioButton(context).apply {
                id = 100 + idx
                text = nombre
                isChecked = idx == 0
                radioGroupColor.addView(this)
            }
        }
        layout.addView(radioGroupColor)

        AlertDialog.Builder(context)
            .setTitle("Nuevo punto de interés")
            .setView(layout)
            .setPositiveButton("Agregar") { _, _ ->
                val nombre = inputNombre.text.toString().trim().ifBlank { "PDI" }

                val tipoIdx = radioGroupTipo.indexOfChild(
                    radioGroupTipo.findViewById(radioGroupTipo.checkedRadioButtonId)
                ).coerceAtLeast(0)
                val tipoPoi = TIPOS_POI[tipoIdx].first

                val colorIdx = radioGroupColor.indexOfChild(
                    radioGroupColor.findViewById(radioGroupColor.checkedRadioButtonId)
                ).coerceAtLeast(0)
                val color = COLORES_POI[colorIdx].second

                host.savePoi(lat, lon, nombre, tipoPoi, color)
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }
}
