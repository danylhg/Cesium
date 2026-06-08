package com.operaciones.operaciones_android.ui.panel

import android.view.LayoutInflater
import android.widget.EditText
import android.widget.FrameLayout
import androidx.recyclerview.widget.RecyclerView
import com.operaciones.operaciones_android.model.ChatMessage
import com.operaciones.operaciones_android.model.DispositivoItem
import com.operaciones.operaciones_android.model.EquipoItem
import com.operaciones.operaciones_android.model.Operation
import com.operaciones.operaciones_android.model.PersonalItem
import com.operaciones.operaciones_android.model.User
import com.operaciones.operaciones_android.model.VehiculoItem
import com.operaciones.operaciones_android.ui.adapter.ChatAdapter

data class ChatChannelSelection(
    val type: String,
    val destinatarioRol: String,
    val destinoTipo: String? = null,
    val destinoId: String? = null,
    val destinoLabel: String? = null,
    val destinoSendId: String? = null
)

data class ChatPanelRefs(
    val recyclerView: RecyclerView,
    val adapter: ChatAdapter,
    val input: EditText
)

class MainPanelRenderer(
    private val host: Host
) {
    private val operationRenderer = OperationPanelRenderer(host)
    private val chatRenderer = ChatPanelRenderer(host)
    private val personalRenderer = PersonalPanelRenderer(host)
    private val vehicleRenderer = VehiclePanelRenderer(host)
    private val equipmentRenderer = EquipmentPanelRenderer(host)
    private val deviceRenderer = DevicePanelRenderer(host)

    interface Host {
        fun getLayoutInflater(): LayoutInflater
        fun addMessage(msg: ChatMessage)
        fun openChatPanel()
        fun sendChatMessage(
            text: String,
            alert: Boolean = false,
            destinatarioRol: String? = null,
            destinoTipo: String? = null,
            destinoId: String? = null,
            destinoLabel: String? = null
        )
        fun requestChatAttachment(
            source: String,
            destinatarioRol: String? = null,
            destinoTipo: String? = null,
            destinoId: String? = null,
            destinoLabel: String? = null
        )
        fun shouldShowSimulationButton(): Boolean
        fun isSimulationActive(): Boolean
        fun toggleSimulation()
        fun selectPersonalOnMap(idPersonal: Int, lat: Double, lon: Double, label: String)
        fun selectVehiculoOnMap(idVehiculo: Int, lat: Double?, lon: Double?, label: String)
        fun selectEquipoOnMap(idEquipo: Int, lat: Double?, lon: Double?, label: String)
        fun selectDispositivoOnMap(idDispositivo: Int, lat: Double?, lon: Double?, label: String)
        fun refreshPersonalPanelIfActive()
    }

    fun selectPersonal(idPersonal: Int?) {
        personalRenderer.selectPersonal(idPersonal)
    }

    fun selectVehiculo(idVehiculo: Int?) {
        vehicleRenderer.selectVehiculo(idVehiculo)
    }

    fun selectEquipo(idEquipo: Int?) {
        equipmentRenderer.selectEquipo(idEquipo)
    }

    fun selectDispositivo(idDispositivo: Int?) {
        deviceRenderer.selectDispositivo(idDispositivo)
    }

    fun updatePersonalLocation(id: Int, lat: Double, lon: Double) {
        personalRenderer.updatePersonalLocation(id, lat, lon)
    }

    fun updateVehiculoLocation(id: Int, lat: Double, lon: Double) {
        vehicleRenderer.updateVehiculoLocation(id, lat, lon)
    }

    fun updateEquipoLocation(id: Int, lat: Double, lon: Double) {
        equipmentRenderer.updateEquipoLocation(id, lat, lon)
    }

    fun updateDispositivoLocation(
        id: Int,
        lat: Double,
        lon: Double,
        numeroSerie: String? = null,
        imei: String? = null
    ) {
        deviceRenderer.updateDispositivoLocation(id, lat, lon, numeroSerie, imei)
    }

    fun inflateOperationPanel(
        panelContent: FrameLayout,
        operation: Operation
    ) {
        operationRenderer.inflate(panelContent, operation)
    }

    fun inflateChatPanel(
        panelContent: FrameLayout,
        messages: MutableList<ChatMessage>,
        currentUser: User,
        personalList: List<PersonalItem>,
        vehiculosList: List<VehiculoItem>,
        onFilterChanged: (ChatChannelSelection) -> Unit = {}
    ): ChatPanelRefs =
        chatRenderer.inflate(panelContent, messages, currentUser, personalList, vehiculosList, onFilterChanged)

    fun inflatePersonalPanel(
        panelContent: FrameLayout,
        personalList: List<PersonalItem>,
        currentUser: User
    ) {
        personalRenderer.inflate(panelContent, personalList, currentUser)
    }

    fun inflateVehiculoPanel(
        panelContent: FrameLayout,
        vehiculosList: List<VehiculoItem>
    ) {
        vehicleRenderer.inflate(panelContent, vehiculosList)
    }

    fun inflateEquipoPanel(
        panelContent: FrameLayout,
        equiposList: List<EquipoItem>
    ) {
        equipmentRenderer.inflate(panelContent, equiposList)
    }

    fun inflateDispositivoPanel(
        panelContent: FrameLayout,
        dispositivosList: List<DispositivoItem>
    ) {
        deviceRenderer.inflate(panelContent, dispositivosList)
    }
}
