package com.operaciones.operaciones_android.map

import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import com.operaciones.operaciones_android.model.ChatMessage
import com.operaciones.operaciones_android.model.User
import com.operaciones.operaciones_android.webview.CesiumWebController
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MapActionController(
    private val host: Host,
    private val cesiumWebController: CesiumWebController
) {

    private fun buildMilUniqueName(baseName: String): String {
        val normalizedBase = baseName.trim().ifBlank { "Simbolo MIL" }
        val stamp = SimpleDateFormat("yyyyMMddHHmmssSSS", Locale.US).format(Date())
        return "$normalizedBase $stamp"
    }

    companion object {
        private const val COLOR_MIL_DEFAULT = "#FF4500"

        val COLORES_POI = listOf(
            "Amarillo" to "#FFD700",
            "Rojo" to "#FF4500",
            "Azul" to "#00BFFF",
            "Verde" to "#00FF88",
            "Naranja" to "#FF8C00",
            "Blanco" to "#FFFFFF",
            "Morado" to "#9400D3",
            "Rosa" to "#FF69B4"
        )

        val TIPOS_POI = listOf(
            "PDI" to "Punto de Interes",
            "MIL" to "Simbolo Militar"
        )

        val SIMBOLOS_MIL = listOf(
            "Infanteria" to "SFGPUCI--------",
            "Unidad Blindada" to "SFGPUCD--------",
            "Artilleria de Campo" to "SFGPUCA--------",
            "Reconocimiento" to "SFGPUCR--------",
            "Ingenieros" to "SFGPUCJ--------",
            "Punto de Control" to "SFGPIP---------",
            "Base / Cuartel" to "SFGPIB---------",
            "Radar" to "SFGPIR---------"
        )
    }

    interface Host {
        fun addMessage(msg: ChatMessage)
        fun openChatPanel()
        fun isChatPanelActive(): Boolean
        fun savePoi(
            lat: Double,
            lon: Double,
            nombre: String,
            tipoPoi: String,
            color: String,
            iconoSrc: String? = null
        )
    }

    fun showMapActionDialog(
        currentUser: User,
        lat: Double,
        lon: Double
    ) {
        val coord = "%.5f, %.5f".format(lat, lon)

        val actions = listOf<Pair<String, () -> Unit>>(
            "Usar como origen de ruta" to {
                cesiumWebController.setRouteStart(lat, lon)
            },
            "Usar como destino de ruta" to {
                cesiumWebController.setRouteEnd(lat, lon)
            },
            "Limpiar ruta" to {
                cesiumWebController.clearRoute()
                (host as? com.operaciones.operaciones_android.ui.MainActivity)?.sendClearRouteToBackend()
            }
        )

        AlertDialog.Builder(host as android.content.Context)
            .setTitle("Ruta en $coord")
            .setItems(actions.map { it.first }.toTypedArray()) { _, which ->
                actions[which].second.invoke()
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    fun showPoiCreationDialog(lat: Double, lon: Double, author: String, defaultTipoPoi: String = "PDI") {
        val context = host as android.content.Context
        val dp8 = (8 * context.resources.displayMetrics.density).toInt()
        val dp4 = (4 * context.resources.displayMetrics.density).toInt()
        val defaultTipoIndex = TIPOS_POI
            .indexOfFirst { it.first.equals(defaultTipoPoi, ignoreCase = true) }
            .takeIf { it >= 0 } ?: 0

        val layout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp8 * 2, dp8, dp8 * 2, dp8)
        }

        val labelNombre = TextView(context).apply { text = "Nombre" }
        val inputNombre = EditText(context).apply { setText("PDI") }
        layout.addView(labelNombre)
        layout.addView(inputNombre)

        val labelTipo = TextView(context).apply {
            text = "Tipo"
            setPadding(0, dp8, 0, dp4)
        }
        layout.addView(labelTipo)

        val radioGroupTipo = RadioGroup(context).apply { orientation = RadioGroup.HORIZONTAL }
        TIPOS_POI.forEachIndexed { idx, (_, etiqueta) ->
            RadioButton(context).apply {
                id = idx + 1
                text = etiqueta
                isChecked = idx == defaultTipoIndex
                radioGroupTipo.addView(this)
            }
        }
        layout.addView(radioGroupTipo)

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

        val labelSimboloMil = TextView(context).apply {
            text = "Simbolo MIL"
            setPadding(0, dp8, 0, dp4)
        }
        layout.addView(labelSimboloMil)

        val radioGroupSimboloMil = RadioGroup(context)
        SIMBOLOS_MIL.forEachIndexed { idx, (nombre, _) ->
            RadioButton(context).apply {
                id = 200 + idx
                text = nombre
                isChecked = idx == 0
                radioGroupSimboloMil.addView(this)
            }
        }
        layout.addView(radioGroupSimboloMil)

        fun updateMilSelectorVisibility() {
            val tipoIdx = radioGroupTipo.indexOfChild(
                radioGroupTipo.findViewById(radioGroupTipo.checkedRadioButtonId)
            ).coerceAtLeast(0)
            val isMil = TIPOS_POI[tipoIdx].first == "MIL"
            labelNombre.visibility = if (isMil) View.GONE else View.VISIBLE
            inputNombre.visibility = if (isMil) View.GONE else View.VISIBLE
            labelColor.visibility = if (isMil) View.GONE else View.VISIBLE
            radioGroupColor.visibility = if (isMil) View.GONE else View.VISIBLE
            labelSimboloMil.visibility = if (isMil) View.VISIBLE else View.GONE
            radioGroupSimboloMil.visibility = if (isMil) View.VISIBLE else View.GONE
        }

        radioGroupTipo.setOnCheckedChangeListener { _, _ -> updateMilSelectorVisibility() }
        updateMilSelectorVisibility()

        AlertDialog.Builder(context)
            .setTitle("Nuevo punto de interes")
            .setView(layout)
            .setPositiveButton("Agregar") { _, _ ->
                val tipoIdx = radioGroupTipo.indexOfChild(
                    radioGroupTipo.findViewById(radioGroupTipo.checkedRadioButtonId)
                ).coerceAtLeast(0)
                val tipoPoi = TIPOS_POI[tipoIdx].first

                val iconoSrc = if (tipoPoi == "MIL") {
                    val simboloIdx = radioGroupSimboloMil.indexOfChild(
                        radioGroupSimboloMil.findViewById(radioGroupSimboloMil.checkedRadioButtonId)
                    ).coerceAtLeast(0)
                    SIMBOLOS_MIL[simboloIdx].second
                } else {
                    null
                }

                val nombre = if (tipoPoi == "MIL") {
                    val simboloIdx = radioGroupSimboloMil.indexOfChild(
                        radioGroupSimboloMil.findViewById(radioGroupSimboloMil.checkedRadioButtonId)
                    ).coerceAtLeast(0)
                    buildMilUniqueName(SIMBOLOS_MIL[simboloIdx].first)
                } else {
                    inputNombre.text.toString().trim().ifBlank { "PDI" }
                }

                val color = if (tipoPoi == "MIL") {
                    COLOR_MIL_DEFAULT
                } else {
                    val colorIdx = radioGroupColor.indexOfChild(
                        radioGroupColor.findViewById(radioGroupColor.checkedRadioButtonId)
                    ).coerceAtLeast(0)
                    COLORES_POI[colorIdx].second
                }

                host.savePoi(lat, lon, nombre, tipoPoi, color, iconoSrc)
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }
}
