package com.operaciones.operaciones_android.ui.panel

import android.graphics.Color
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.operaciones.operaciones_android.R
import com.operaciones.operaciones_android.model.VehiculoItem

internal class VehiclePanelRenderer(
    private val host: MainPanelRenderer.Host
) {
    private data class FlotillaNode(
        val directos: MutableList<String> = mutableListOf(),
        val grupos: LinkedHashMap<String, MutableList<String>> = LinkedHashMap()
    )

    fun inflate(panelContent: FrameLayout, vehiculosList: List<VehiculoItem>) {
        val view = host.getLayoutInflater().inflate(R.layout.panel_vehiculo, panelContent, false)
        panelContent.addView(view)

        val list = view.findViewById<LinearLayout>(R.id.vehiculoList)
        if (vehiculosList.isEmpty()) {
            addEmptyState(list, "Cargando vehiculos...")
            return
        }

        vehiculosList.groupBy { it.idVehiculo }.forEach { (_, items) ->
            renderVehicleGroup(list, items)
        }
    }

    private fun renderVehicleGroup(list: LinearLayout, items: List<VehiculoItem>) {
        addVehicleHeader(list, items.first())

        val cets = LinkedHashMap<String, LinkedHashMap<String, FlotillaNode>>()
        val sinContexto = mutableListOf<String>()
        buildAssignmentTree(items, cets, sinContexto)
        renderAssignmentTree(list, cets, sinContexto)

        list.addView(View(list.context).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(list, 10f)
            )
        })
    }

    private fun addVehicleHeader(list: LinearLayout, vehicle: VehiculoItem) {
        val row = host.getLayoutInflater().inflate(R.layout.item_equipo, list, false)
        val tipo = vehicle.tipo.uppercase()

        row.findViewById<TextView>(R.id.equipoIcon).text = when {
            tipo == "INTERCEPTOR" -> "INT"
            tipo == "BLINDADO" -> "BLD"
            tipo == "PICKUP" -> "PK"
            tipo.contains("CTICO") -> "TAC"
            else -> "VEH"
        }

        row.findViewById<TextView>(R.id.equipoNombre).text = when {
            vehicle.codigoInterno.isNotBlank() && vehicle.alias.isNotBlank() ->
                "${vehicle.codigoInterno} - ${vehicle.alias}"
            vehicle.codigoInterno.isNotBlank() -> vehicle.codigoInterno
            vehicle.alias.isNotBlank() -> vehicle.alias
            else -> "Vehiculo"
        }

        row.findViewById<TextView>(R.id.equipoDetalle).text = ""
        row.findViewById<TextView>(R.id.equipoTipo).text =
            if (vehicle.tipo.isNotBlank()) vehicle.tipo.uppercase() else "VEHICULO"

        list.addView(row)
    }

    private fun buildAssignmentTree(
        items: List<VehiculoItem>,
        cets: LinkedHashMap<String, LinkedHashMap<String, FlotillaNode>>,
        sinContexto: MutableList<String>
    ) {
        for (item in items) {
            val personal = displayName(item).ifBlank { "" }
            val cetNombre = item.cetNombre.ifBlank { "Sin CET" }
            val destination = vehicleDestination(item)

            if (destination == null) {
                if (personal.isNotBlank()) sinContexto.add(personal)
                continue
            }

            val flotillas = cets.getOrPut(cetNombre) { LinkedHashMap() }
            val flotilla = flotillas.getOrPut(destination.first) { FlotillaNode() }
            if (destination.second.isNotBlank()) {
                flotilla.grupos.getOrPut(destination.second) { mutableListOf() }
                    .also { if (personal.isNotBlank()) it.add(personal) }
            } else if (personal.isNotBlank()) {
                flotilla.directos.add(personal)
            }
        }
    }

    private fun renderAssignmentTree(
        list: LinearLayout,
        cets: LinkedHashMap<String, LinkedHashMap<String, FlotillaNode>>,
        sinContexto: List<String>
    ) {
        for ((cetNombre, flotillas) in cets) {
            addLabel(list, "$cetNombre (CET)", "#e2e8f0", leftPad = 8f, topPad = 8f)
            for ((flotillaNom, flotilla) in flotillas) {
                if (flotillaNom.isNotBlank()) {
                    addLabel(list, prefixed("Flotilla", flotillaNom), "#94a3b8", leftPad = 16f, topPad = 8f)
                }
                flotilla.directos.forEach { person ->
                    addLabel(list, "-- $person", "#cbd5e1", leftPad = 28f, topPad = 2f)
                }
                for ((grupoNom, personas) in flotilla.grupos) {
                    addLabel(list, prefixed("Grupo", grupoNom), "#64748b", leftPad = 28f, topPad = 6f)
                    personas.forEach { person ->
                        addLabel(list, "-- $person", "#cbd5e1", leftPad = 40f, topPad = 2f)
                    }
                }
            }
        }

        sinContexto.forEach { person ->
            addLabel(list, "-- $person", "#cbd5e1", leftPad = 12f, topPad = 2f)
        }
    }

    private fun vehicleDestination(item: VehiculoItem): Pair<String, String>? =
        when {
            item.grupoPadreNombre.isNotBlank() -> item.grupoPadreNombre to item.grupoNombre
            item.grupoNombre.isNotBlank() && item.tipoDestino == "GRUPO" -> "" to item.grupoNombre
            item.grupoNombre.isNotBlank() -> item.grupoNombre to ""
            else -> null
        }

    private fun displayName(item: VehiculoItem): String {
        val nombreCompleto = listOf(item.personalNombre, item.personalApellido)
            .filter { it.isNotBlank() }
            .joinToString(" ")
            .trim()

        return when {
            nombreCompleto.isNotBlank() && item.personalPuesto.isNotBlank() ->
                "${item.personalPuesto} $nombreCompleto".trim()
            nombreCompleto.isNotBlank() -> nombreCompleto
            else -> item.asignadoAApodo
        }
    }

    private fun addEmptyState(list: LinearLayout, textValue: String) {
        list.addView(TextView(list.context).apply {
            text = textValue
            setTextColor(Color.parseColor("#64748b"))
            textSize = 12f
            setPadding(0, 16, 0, 0)
        })
    }

    private fun addLabel(
        list: LinearLayout,
        textValue: String,
        hexColor: String,
        leftPad: Float = 0f,
        topPad: Float = 4f
    ) {
        list.addView(TextView(list.context).apply {
            text = textValue
            setTextColor(Color.parseColor(hexColor))
            textSize = 11f
            setPadding(dp(list, leftPad), dp(list, topPad), 0, 0)
        })
    }

    private fun prefixed(prefix: String, name: String): String {
        val clean = name.trim()
        return if (clean.lowercase().startsWith(prefix.lowercase())) clean else "$prefix $clean"
    }

    private fun dp(view: View, value: Float): Int =
        (value * view.context.resources.displayMetrics.density + 0.5f).toInt()
}
