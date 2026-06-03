package com.operaciones.operaciones_android.ui.panel

import android.graphics.Color
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.operaciones.operaciones_android.R
import com.operaciones.operaciones_android.model.EquipoItem

internal class EquipmentPanelRenderer(
    private val host: MainPanelRenderer.Host
) {
    fun inflate(panelContent: FrameLayout, equiposList: List<EquipoItem>) {
        val view = host.getLayoutInflater().inflate(R.layout.panel_equipo, panelContent, false)
        panelContent.addView(view)

        val list = view.findViewById<LinearLayout>(R.id.equipoList)
        if (equiposList.isEmpty()) {
            addEmptyState(list, "Cargando equipo...")
            return
        }

        equipmentGroups(equiposList).forEach { (title, items) ->
            addSectionHeader(list, title)
            items.forEach { item -> addEquipmentRow(list, item) }
        }
    }

    private fun equipmentGroups(equiposList: List<EquipoItem>): List<Pair<String, List<EquipoItem>>> =
        listOf(
            "Equipos de Comunicacion" to equiposList.filter {
                it.categoria.equals("COMUNICACION", ignoreCase = true)
            },
            "Equipos Tacticos" to equiposList.filter {
                it.categoria.equals("TACTICO", ignoreCase = true)
            },
            "Otros equipos" to equiposList.filter {
                !it.categoria.equals("COMUNICACION", ignoreCase = true) &&
                    !it.categoria.equals("TACTICO", ignoreCase = true)
            }
        ).filter { it.second.isNotEmpty() }

    private fun addEquipmentRow(list: LinearLayout, item: EquipoItem) {
        val row = host.getLayoutInflater().inflate(R.layout.item_equipo, list, false)

        row.findViewById<TextView>(R.id.equipoIcon).text = when (item.categoria.uppercase()) {
            "COMUNICACION" -> "COM"
            "TACTICO" -> "TAC"
            else -> "EQP"
        }

        row.findViewById<TextView>(R.id.equipoNombre).text =
            "Nombre de equipo: ${item.nombre.ifBlank { "Equipo" }}"
        row.findViewById<TextView>(R.id.equipoDetalle).text = equipmentDetail(item)
        row.findViewById<TextView>(R.id.equipoTipo).text = ""

        list.addView(row)
    }

    private fun equipmentDetail(item: EquipoItem): String {
        val flotillas = uniqueNonBlank(item.flotillasVinculadas)
        val grupos = uniqueNonBlank(item.gruposVinculados)
        val contextValues = (flotillas + grupos).map { it.trim().lowercase() }.toSet()
        val destino = destinationText(item)
        val showDestino = destino.isNotBlank() &&
            !destino.equals("Sin destino", ignoreCase = true) &&
            !contextValues.contains(destino.trim().lowercase())

        return buildString {
            append("Numero: ")
            append(item.numeroSerie.ifBlank { "Sin numero" })
            if (flotillas.isNotEmpty()) {
                append("\n\n")
                append(flotillas.joinToString(", "))
            }
            if (grupos.isNotEmpty()) {
                append("\n\n")
                append(grupos.joinToString(", "))
            }
            if (showDestino) {
                append("\n\n-- ")
                append(destino)
            }
        }
    }

    private fun addSectionHeader(list: LinearLayout, textValue: String) {
        list.addView(TextView(list.context).apply {
            text = textValue
            setTextColor(Color.parseColor("#a0c4ff"))
            textSize = 13f
            setPadding(0, dp(list, 8f), 0, dp(list, 8f))
        })
    }

    private fun addEmptyState(list: LinearLayout, textValue: String) {
        list.addView(TextView(list.context).apply {
            text = textValue
            setTextColor(Color.parseColor("#64748b"))
            textSize = 12f
            setPadding(0, 16, 0, 0)
        })
    }

    private fun uniqueNonBlank(values: List<String>): List<String> =
        values.map { it.trim() }.filter { it.isNotBlank() }.distinct()

    private fun destinationText(item: EquipoItem): String = when {
        item.vehiculoAsignado.isNotBlank() -> item.vehiculoAsignado
        item.personalAsignado.isNotBlank() -> item.personalAsignado
        item.asignadoA.isNotBlank() -> item.asignadoA
        else -> "Sin destino"
    }

    private fun dp(list: LinearLayout, value: Float): Int =
        (value * list.context.resources.displayMetrics.density + 0.5f).toInt()
}
