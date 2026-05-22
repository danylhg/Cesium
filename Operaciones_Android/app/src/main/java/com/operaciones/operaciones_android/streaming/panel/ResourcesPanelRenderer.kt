package com.operaciones.operaciones_android.ui.panel

import android.graphics.Color
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.operaciones.operaciones_android.R
import com.operaciones.operaciones_android.model.DispositivoItem
import com.operaciones.operaciones_android.model.EquipoItem
import com.operaciones.operaciones_android.model.PersonalItem
import com.operaciones.operaciones_android.model.User
import com.operaciones.operaciones_android.model.UserRole
import com.operaciones.operaciones_android.model.VehiculoItem

internal class ResourcesPanelRenderer(
    private val host: MainPanelRenderer.Host
) {
    private enum class ResourceTab {
        VEHICLES,
        EQUIPMENT,
        DEVICES,
        PERSONAL
    }

    private var activeTab = ResourceTab.VEHICLES

    private data class RoleResources(
        val vehiculos: List<VehiculoItem>,
        val equipos: List<EquipoItem>,
        val dispositivos: List<DispositivoItem>
    )

    private data class CellScope(
        val cetNames: Set<String>,
        val flotillaNames: Set<String>
    )

    fun inflate(
        panelContent: FrameLayout,
        vehiculosList: List<VehiculoItem>,
        equiposList: List<EquipoItem>,
        dispositivosList: List<DispositivoItem>,
        personalList: List<PersonalItem>,
        currentUser: User
    ) {
        val view = host.getLayoutInflater().inflate(R.layout.panel_recursos, panelContent, false)
        panelContent.addView(view)

        val list = view.findViewById<LinearLayout>(R.id.recursosList)
        val title = view.findViewById<TextView>(R.id.recursosTitle)
        val vehiclesTab = view.findViewById<TextView>(R.id.tabRecursosVehiculos)
        val equipmentTab = view.findViewById<TextView>(R.id.tabRecursosEquipos)
        val devicesTab = view.findViewById<TextView>(R.id.tabRecursosDispositivos)
        val personalTab = view.findViewById<TextView>(R.id.tabRecursosPersonal)
        val resources = resourcesForRole(vehiculosList, equiposList, dispositivosList, currentUser)

        title.text = "RECURSOS"

        fun updateTabLabels() {
            vehiclesTab.text = "Vehiculos"
            equipmentTab.text = "Equipos"
            devicesTab.text = "Dispositivos"
            personalTab.text = "Personal"
        }

        fun renderVehicles() {
            activeTab = ResourceTab.VEHICLES
            list.removeAllViews()
            setSelectedTab(vehiclesTab, true)
            setSelectedTab(equipmentTab, false)
            setSelectedTab(devicesTab, false)
            setSelectedTab(personalTab, false)
            updateTabLabels()
            if (resources.vehiculos.isEmpty()) {
                addEmptyState(
                    list,
                    if (vehiculosList.isEmpty()) "Cargando vehiculos..." else "Sin vehiculos asignados a la operacion."
                )
            } else {
                resources.vehiculos.distinctBy { it.idVehiculo }.forEach { item ->
                    addVehicleRow(list, item, currentUser)
                }
            }
        }

        fun renderEquipment() {
            activeTab = ResourceTab.EQUIPMENT
            list.removeAllViews()
            setSelectedTab(vehiclesTab, false)
            setSelectedTab(equipmentTab, true)
            setSelectedTab(devicesTab, false)
            setSelectedTab(personalTab, false)
            updateTabLabels()
            if (resources.equipos.isEmpty()) {
                addEmptyState(list, "Sin equipos asignados a esta persona.")
            } else {
                resources.equipos.distinctBy { it.idEquipo }.forEach { item ->
                    addEquipmentRow(list, item, currentUser, vehiculosList, personalList)
                }
            }
        }

        fun renderDevices() {
            activeTab = ResourceTab.DEVICES
            list.removeAllViews()
            setSelectedTab(vehiclesTab, false)
            setSelectedTab(equipmentTab, false)
            setSelectedTab(devicesTab, true)
            setSelectedTab(personalTab, false)
            updateTabLabels()
            if (resources.dispositivos.isEmpty()) {
                addEmptyState(list, "Sin dispositivos asignados a esta persona.")
            } else {
                resources.dispositivos.distinctBy { it.idDispositivo }.forEach { item ->
                    addDeviceRow(list, item)
                }
            }
        }

        fun renderPersonal() {
            activeTab = ResourceTab.PERSONAL
            list.removeAllViews()
            setSelectedTab(vehiclesTab, false)
            setSelectedTab(equipmentTab, false)
            setSelectedTab(devicesTab, false)
            setSelectedTab(personalTab, true)
            updateTabLabels()
            if (personalList.isEmpty()) {
                addEmptyState(list, "Cargando personal...")
            } else {
                personalList
                    .distinctBy { it.idPersonal }
                    .sortedBy { personName(it).lowercase() }
                    .forEach { item -> addPersonalRow(list, item, currentUser) }
            }
        }

        vehiclesTab.setOnClickListener { renderVehicles() }
        equipmentTab.setOnClickListener { renderEquipment() }
        devicesTab.setOnClickListener { renderDevices() }
        personalTab.setOnClickListener { renderPersonal() }
        when (activeTab) {
            ResourceTab.VEHICLES -> renderVehicles()
            ResourceTab.EQUIPMENT -> renderEquipment()
            ResourceTab.DEVICES -> renderDevices()
            ResourceTab.PERSONAL -> renderPersonal()
        }
    }

    private fun resourcesForRole(
        vehiculosList: List<VehiculoItem>,
        equiposList: List<EquipoItem>,
        dispositivosList: List<DispositivoItem>,
        currentUser: User
    ): RoleResources =
        RoleResources(
            vehiculos = vehiculosList,
            equipos = equiposList.filter { it.idPersonalAsignado == currentUser.id },
            dispositivos = dispositivosList.filter { it.idPersonal == currentUser.id }
        )

    private fun cellScope(personalList: List<PersonalItem>, currentUser: User): CellScope {
        val cell = personalList.firstOrNull {
            it.idPersonal == currentUser.id && it.rol.equals("CELL", ignoreCase = true)
        }
        val cetNames = normalizedValues(cell?.cetNombre)
        val cet = personalList.firstOrNull { person ->
            person.rol.equals("CET", ignoreCase = true) &&
                personCetNames(person).any { it in cetNames }
        }
        val flotillaLabel = firstNonBlank(
            cell?.cetFlotilla,
            cell?.grupoPadreNombre,
            cet?.cetFlotilla,
            cet?.grupoNombre
        )

        return CellScope(
            cetNames = cetNames + (cet?.let(::personCetNames) ?: emptySet()),
            flotillaNames = normalizedValues(
                flotillaLabel,
                cell?.cetFlotilla,
                cell?.grupoPadreNombre,
                cet?.cetFlotilla,
                cet?.grupoNombre
            )
        )
    }

    private fun addVehicleRow(list: LinearLayout, item: VehiculoItem, currentUser: User) {
        val row = host.getLayoutInflater().inflate(R.layout.item_equipo, list, false)
        val type = item.tipo.uppercase()

        row.findViewById<TextView>(R.id.equipoIcon).text = when {
            type == "INTERCEPTOR" -> "INT"
            type == "BLINDADO" -> "BLD"
            type == "PICKUP" -> "PK"
            else -> "VEH"
        }
        row.findViewById<TextView>(R.id.equipoNombre).text = vehicleName(item)
        row.findViewById<TextView>(R.id.equipoDetalle).text =
            if (currentUser.rol == UserRole.CELL) vehicleCellDetail(item) else vehicleCetDetail(item)
        row.findViewById<TextView>(R.id.equipoTipo).text = "VEH"
        bindVehicleLocation(row, item)

        list.addView(row)
    }

    private fun addEquipmentRow(
        list: LinearLayout,
        item: EquipoItem,
        currentUser: User,
        vehiculosList: List<VehiculoItem>,
        personalList: List<PersonalItem>
    ) {
        val row = host.getLayoutInflater().inflate(R.layout.item_equipo, list, false)

        row.findViewById<TextView>(R.id.equipoIcon).text = when (item.categoria.uppercase()) {
            "COMUNICACION" -> "COM"
            "TACTICO" -> "TAC"
            else -> "EQP"
        }
        row.findViewById<TextView>(R.id.equipoNombre).text = item.nombre.ifBlank { "Equipo" }
        row.findViewById<TextView>(R.id.equipoDetalle).text =
            if (currentUser.rol == UserRole.CELL) equipmentCellDetail(item) else equipmentCetDetail(item)
        row.findViewById<TextView>(R.id.equipoTipo).text = "EQP"
        bindEquipmentLocation(row, item, vehiculosList, personalList)

        list.addView(row)
    }

    private fun addDeviceRow(list: LinearLayout, item: DispositivoItem) {
        val row = host.getLayoutInflater().inflate(R.layout.item_equipo, list, false)
        row.findViewById<TextView>(R.id.equipoIcon).text = "DEV"
        row.findViewById<TextView>(R.id.equipoNombre).text = deviceName(item)
        row.findViewById<TextView>(R.id.equipoDetalle).text = deviceDetail(item)
        row.findViewById<TextView>(R.id.equipoTipo).text = "DISP"
        list.addView(row)
    }

    private fun addPersonalRow(list: LinearLayout, item: PersonalItem, currentUser: User) {
        val row = host.getLayoutInflater().inflate(R.layout.item_personal, list, false)
        val label = personName(item).ifBlank { "Personal" }
        row.findViewById<TextView>(R.id.personalAvatar).text =
            item.nombre.firstOrNull()?.toString() ?: "P"
        row.findViewById<TextView>(R.id.personalNombre).text = label
        row.findViewById<TextView>(R.id.personalRol).text =
            listOf(item.rol, item.puesto).filter { it.isNotBlank() }.joinToString(" - ")

        val hasLocation = item.lat != null && item.lon != null
        row.findViewById<View>(R.id.personalStatus).setBackgroundColor(
            Color.parseColor(if (hasLocation) "#22C55E" else "#475569")
        )
        if (item.idPersonal == currentUser.id) {
            row.setBackgroundColor(Color.parseColor("#0D1F3C"))
            row.findViewById<TextView>(R.id.personalNombre).setTextColor(Color.parseColor("#3B82F6"))
        }
        bindRowClick(row) {
            if (item.lat != null && item.lon != null) {
                host.selectPersonalOnMap(item.idPersonal, item.lat, item.lon, label)
            } else {
                host.showResourceLocationUnavailable()
            }
        }
        list.addView(row)
    }

    private fun bindVehicleLocation(row: android.view.View, item: VehiculoItem) {
        val lat = item.lat
        val lon = item.lon
        bindRowClick(row) {
            if (lat != null && lon != null) {
                host.selectVehicleOnMap(item.idVehiculo, lat, lon, vehicleName(item))
            } else {
                host.showResourceLocationUnavailable()
            }
        }
    }

    private fun bindEquipmentLocation(
        row: android.view.View,
        item: EquipoItem,
        vehiculosList: List<VehiculoItem>,
        personalList: List<PersonalItem>
    ) {
        val vehicle = item.idVehiculoAsignado?.let { id ->
            vehiculosList.firstOrNull { it.idVehiculo == id && it.lat != null && it.lon != null }
        }
        val person = item.idPersonalAsignado?.let { id ->
            personalList.firstOrNull { it.idPersonal == id && it.lat != null && it.lon != null }
        }

        bindRowClick(row) {
            when {
                vehicle?.lat != null && vehicle.lon != null ->
                    host.selectVehicleOnMap(vehicle.idVehiculo, vehicle.lat, vehicle.lon, vehicleName(vehicle))
                person?.lat != null && person.lon != null ->
                    host.selectPersonalOnMap(person.idPersonal, person.lat, person.lon, personName(person))
                else -> host.showResourceLocationUnavailable()
            }
        }
    }

    private fun bindRowClick(row: android.view.View, action: () -> Unit) {
        row.foreground = row.context.obtainStyledAttributes(
            intArrayOf(android.R.attr.selectableItemBackground)
        ).getDrawable(0)
        row.isClickable = true
        row.isFocusable = true
        row.setOnClickListener { action() }
    }

    private fun vehicleName(item: VehiculoItem): String =
        listOf(item.codigoInterno, item.alias)
            .filter { it.isNotBlank() }
            .joinToString(" - ")
            .ifBlank { item.nombre.ifBlank { "Vehiculo" } }

    private fun vehicleCellDetail(item: VehiculoItem): String =
        listOf(item.tipo, vehicleDestination(item))
            .filter { it.isNotBlank() }
            .joinToString(" | ")
            .ifBlank { "Vehiculo asignado" }

    private fun vehicleCetDetail(item: VehiculoItem): String =
        listOf(item.tipo, vehicleDestination(item))
            .filter { it.isNotBlank() }
            .joinToString(" | ")

    private fun equipmentCellDetail(item: EquipoItem): String =
        listOf(defaultEquipmentType(item), equipmentDestination(item))
            .filter { it.isNotBlank() }
            .joinToString(" | ")

    private fun equipmentCetDetail(item: EquipoItem): String =
        listOf(defaultEquipmentType(item), equipmentDestination(item))
            .filter { it.isNotBlank() }
            .joinToString(" | ")

    private fun deviceName(item: DispositivoItem): String =
        listOf(item.tipo, item.marca, item.modelo)
            .filter { it.isNotBlank() }
            .joinToString(" ")
            .ifBlank { "Dispositivo" }

    private fun deviceDetail(item: DispositivoItem): String =
        listOf(
            item.numeroTelefono.takeIf { it.isNotBlank() }?.let { "Tel: $it" },
            item.numeroSerie.takeIf { it.isNotBlank() }?.let { "Serie: $it" },
            item.imei.takeIf { it.isNotBlank() }?.let { "IMEI: $it" }
        )
            .filterNotNull()
            .joinToString(" | ")
            .ifBlank { item.sistemaOperativo.ifBlank { "Dispositivo asignado" } }

    private fun vehicleDestination(item: VehiculoItem): String = when {
        item.grupoNombre.isNotBlank() && item.grupoPadreNombre.isNotBlank() ->
            "${item.grupoPadreNombre} / ${item.grupoNombre}"
        item.grupoNombre.isNotBlank() -> item.grupoNombre
        item.asignadoAApodo.isNotBlank() -> item.asignadoAApodo
        else -> ""
    }

    private fun equipmentDestination(item: EquipoItem): String = when {
        item.vehiculoAsignado.isNotBlank() -> item.vehiculoAsignado
        item.grupoAsignado.isNotBlank() -> item.grupoAsignado
        item.personalAsignado.isNotBlank() -> item.personalAsignado
        item.flotillaAsignada.isNotBlank() -> item.flotillaAsignada
        else -> ""
    }

    private fun vehicleFleetNames(item: VehiculoItem): Set<String> =
        normalizedValues(
            item.grupoPadreNombre,
            item.grupoNombre.takeIf { item.grupoPadreNombre.isBlank() }
        )

    private fun equipmentFleetNames(item: EquipoItem): Set<String> =
        normalizedValues(item.flotillaAsignada, *item.flotillasVinculadas.toTypedArray())

    private fun defaultEquipmentType(item: EquipoItem): String =
        item.tipoEquipo.ifBlank {
            when (item.categoria.uppercase()) {
                "COMUNICACION" -> "Comunicacion"
                "TACTICO" -> "Tactico"
                else -> "Equipo asignado"
            }
        }

    private fun setSelectedTab(tab: TextView, selected: Boolean) {
        tab.setBackgroundResource(
            if (selected) R.drawable.bg_resource_tab_selected else R.drawable.bg_resource_tab
        )
        tab.setTextColor(Color.parseColor(if (selected) "#F8FAFC" else "#94A3B8"))
    }

    private fun addEmptyState(list: LinearLayout, value: String) {
        list.addView(TextView(list.context).apply {
            text = value
            setTextColor(Color.parseColor("#64748b"))
            textSize = 11f
            setPadding(0, dp(list, 4f), 0, dp(list, 4f))
        })
    }

    private fun normalizedValues(vararg values: String?): Set<String> =
        values.filterNotNull()
            .map { it.trim().lowercase() }
            .filter { it.isNotBlank() }
            .toSet()

    private fun personCetNames(person: PersonalItem): Set<String> =
        normalizedValues(personName(person), "${person.nombre} ${person.apellido}", person.apodo)

    private fun personName(person: PersonalItem): String =
        person.apodo.ifBlank { "${person.nombre} ${person.apellido}".trim() }

    private fun firstNonBlank(vararg values: String?): String =
        values.filterNotNull().firstOrNull { it.isNotBlank() }?.trim().orEmpty()

    private fun dp(list: LinearLayout, value: Float): Int =
        (value * list.context.resources.displayMetrics.density + 0.5f).toInt()
}
