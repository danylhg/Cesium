package com.operaciones.operaciones_android.ui.panel

import android.view.LayoutInflater
import android.widget.EditText
import android.widget.FrameLayout
import androidx.recyclerview.widget.RecyclerView
import com.operaciones.operaciones_android.model.ChatMessage
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
    val destinoLabel: String? = null
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
        fun shouldShowSimulationButton(): Boolean
        fun isSimulationActive(): Boolean
        fun toggleSimulation()
        fun selectPersonalOnMap(idPersonal: Int, lat: Double, lon: Double, label: String)
        fun refreshPersonalPanelIfActive()
    }

    fun selectPersonal(idPersonal: Int?) {
        personalRenderer.selectPersonal(idPersonal)
    }

    fun updatePersonalLocation(id: Int, lat: Double, lon: Double) {
        personalRenderer.updatePersonalLocation(id, lat, lon)
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
        onFilterChanged: (ChatChannelSelection) -> Unit = {}
    ): ChatPanelRefs =
        chatRenderer.inflate(panelContent, messages, currentUser, personalList, onFilterChanged)

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
}
