package com.operaciones.operaciones_android.ui.panel

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.operaciones.operaciones_android.R
import com.operaciones.operaciones_android.model.ChatMessage
import com.operaciones.operaciones_android.model.EquipoItem
import com.operaciones.operaciones_android.model.Operation
import com.operaciones.operaciones_android.model.OperationStatus
import com.operaciones.operaciones_android.model.PersonalItem
import com.operaciones.operaciones_android.model.User
import com.operaciones.operaciones_android.model.VehiculoItem
import com.operaciones.operaciones_android.ui.adapter.ChatAdapter

class MainPanelRenderer(
    private val host: Host
) {

    interface Host {
        fun getLayoutInflater(): LayoutInflater
        fun addMessage(msg: ChatMessage)
        fun openChatPanel()
        fun sendChatMessage(text: String, alert: Boolean = false, destinatarioRol: String? = null)
    }

    fun inflateOperationPanel(
        panelContent: FrameLayout,
        operation: Operation
    ) {
        val view = host.getLayoutInflater().inflate(R.layout.panel_operation, panelContent, false)
        panelContent.addView(view)

        view.findViewById<TextView>(R.id.opNombre).text = operation.nombre
        view.findViewById<TextView>(R.id.opCodigo).text = operation.codigo
        view.findViewById<TextView>(R.id.opDescripcion).text = operation.descripcion
        view.findViewById<TextView>(R.id.opPrioridad).text = operation.prioridad
        view.findViewById<TextView>(R.id.opEstado).text = operation.status.name
        view.findViewById<TextView>(R.id.opFechaInicio).text = operation.fechaInicio

        // Colores dinámicos para prioridad
        val priorityColor = when (operation.prioridad.uppercase()) {
            "ALTA" -> Color.parseColor("#ef4444")
            "MEDIA" -> Color.parseColor("#f59e0b")
            "BAJA" -> Color.parseColor("#22c55e")
            else -> Color.parseColor("#94a3b8")
        }
        view.findViewById<TextView>(R.id.opPrioridad).setTextColor(priorityColor)
    }

    fun inflateChatPanel(
        panelContent: FrameLayout,
        messages: MutableList<ChatMessage>,
        currentUser: User
    ): ChatPanelRefs {
        val view = host.getLayoutInflater().inflate(R.layout.panel_chat, panelContent, false)
        panelContent.addView(view)

        val chatRecycler = view.findViewById<RecyclerView>(R.id.chatRecycler)
        val msgInput = view.findViewById<EditText>(R.id.msgInput)
        val sendBtn = view.findViewById<ImageButton>(R.id.sendBtn)
        val alertBtn = view.findViewById<ImageButton>(R.id.btnAlert)

        val chatAdapter = ChatAdapter(messages)
        chatRecycler.layoutManager = LinearLayoutManager(view.context).apply {
            stackFromEnd = true
        }
        chatRecycler.adapter = chatAdapter

        if (messages.isNotEmpty()) {
            chatRecycler.scrollToPosition(messages.size - 1)
        }

        var selectedChannel = "GLOBAL"

        sendBtn.setOnClickListener {
            val t = msgInput.text.toString().trim()
            if (t.isNotEmpty()) {
                host.sendChatMessage(t, alert = false, destinatarioRol = selectedChannel)
                msgInput.text.clear()
            }
        }

        alertBtn.setOnClickListener {
            val t = msgInput.text.toString().trim().ifEmpty { "Aviso de posición" }
            host.sendChatMessage(t, alert = true, destinatarioRol = selectedChannel)
            msgInput.text.clear()
        }

        // --- Channels (Destinatarios) ---
        val channelsContainer = view.findViewById<LinearLayout>(R.id.channelsContainer)
        val channelSelector = view.findViewById<View>(R.id.channelSelector)

        val userRol = currentUser.rol.name.uppercase()
        val availableChannels = mutableListOf("GLOBAL")

        when (userRol) {
            "ADMIN", "CUT" -> {
                availableChannels.add("CET")
                availableChannels.add("CELL")
                availableChannels.add("CELL,CET")
            }
            "CET" -> {
                availableChannels.add("CUT")
            }
            // CELL solo tiene GLOBAL, así que no añadimos nada más
        }

        if (availableChannels.size <= 1) {
            channelSelector.visibility = View.GONE
        } else {
            channelSelector.visibility = View.VISIBLE
            
            fun updateChannelUI() {
                for (i in 0 until channelsContainer.childCount) {
                    val child = channelsContainer.getChildAt(i)
                    val txt = child.findViewById<TextView>(R.id.replyText)
                    val channel = availableChannels[i]
                    if (channel == selectedChannel) {
                        child.setBackgroundResource(R.drawable.bg_quick_reply_selected) // Deberíamos crear esto o usar color directo
                        txt.setTextColor(Color.WHITE)
                    } else {
                        child.setBackgroundResource(R.drawable.bg_quick_reply)
                        txt.setTextColor(Color.parseColor("#94a3b8"))
                    }
                }
            }

            availableChannels.forEach { channel ->
                val chip = host.getLayoutInflater().inflate(R.layout.item_quick_reply, channelsContainer, false)
                val txt = chip.findViewById<TextView>(R.id.replyText)
                txt.text = if (channel == "CELL,CET") "CET + CELL" else channel
                
                chip.setOnClickListener {
                    selectedChannel = channel
                    updateChannelUI()
                }
                channelsContainer.addView(chip)
            }
            updateChannelUI()
        }

        // --- Quick Replies (Mensajes predeterminados) ---
        val quickRepliesContainer = view.findViewById<LinearLayout>(R.id.quickRepliesContainer)
        val suggestions = listOf(
            "Recibido",
            "En camino",
            "Apoyo necesario",
            "Situación controlada",
            "Zona despejada",
            "Solicito extracción"
        )

        suggestions.forEach { text ->
            val chip = host.getLayoutInflater().inflate(R.layout.item_quick_reply, quickRepliesContainer, false)
            val replyText = chip.findViewById<TextView>(R.id.replyText)
            replyText.text = text

            // Estilo especial para mensajes críticos si se desea
            if (text == "Apoyo necesario") {
                replyText.setTextColor(Color.parseColor("#ef4444")) // Rojo para urgencia
            }

            chip.setOnClickListener {
                host.sendChatMessage(text, alert = (text == "Apoyo necesario"), destinatarioRol = selectedChannel)
                msgInput.text.clear()
            }
            quickRepliesContainer.addView(chip)
        }

        return ChatPanelRefs(
            recyclerView = chatRecycler,
            adapter = chatAdapter,
            input = msgInput
        )
    }

    fun inflatePersonalPanel(
        panelContent: FrameLayout,
        personalList: List<PersonalItem>,
        currentUser: User
    ) {
        val view = host.getLayoutInflater().inflate(R.layout.panel_personal, panelContent, false)
        panelContent.addView(view)

        val list = view.findViewById<LinearLayout>(R.id.personalList)

        if (personalList.isEmpty()) {
            val tv = TextView(view.context).apply {
                text = "Cargando personal..."
                setTextColor(Color.parseColor("#64748b"))
                textSize = 12f
                setPadding(0, 16, 0, 0)
            }
            list.addView(tv)
            return
        }

        fun addSectionHeader(text: String) {
            val header = TextView(view.context).apply {
                this.text = text.uppercase()
                setTextColor(Color.parseColor("#94a3b8"))
                textSize = 11f
                setPadding(0, 20, 0, 10)
                letterSpacing = 0.08f
            }
            list.addView(header)
        }

        fun addPersonRow(p: PersonalItem) {
            val row = host.getLayoutInflater().inflate(R.layout.item_personal, list, false)

            row.findViewById<TextView>(R.id.personalAvatar).text =
                p.nombre.firstOrNull()?.toString() ?: "?"

            row.findViewById<TextView>(R.id.personalNombre).text =
                if (p.apodo.isNotBlank()) p.apodo else "${p.nombre} ${p.apellido}"

            row.findViewById<TextView>(R.id.personalRol).text =
                buildString {
                    if (p.rol.isNotBlank()) append(p.rol)
                    if (p.puesto.isNotBlank()) append(" · ${p.puesto}")
                }

            val statusColor = if (p.lat != null && p.lon != null) {
                Color.parseColor("#22c55e")
            } else {
                Color.parseColor("#475569")
            }
            row.findViewById<View>(R.id.personalStatus).setBackgroundColor(statusColor)

            if (p.idPersonal == currentUser.id) {
                row.setBackgroundColor(Color.parseColor("#0d1f3c"))
                row.findViewById<TextView>(R.id.personalNombre)
                    .setTextColor(Color.parseColor("#3b82f6"))
            }

            list.addView(row)
        }

        val administrativos = personalList
            .filter { it.rol.equals("CUT", ignoreCase = true) }
            .sortedBy { it.apodo.ifBlank { "${it.nombre} ${it.apellido}" } }

        val cets = personalList
            .filter { it.rol.equals("CET", ignoreCase = true) }
            .sortedBy { it.apodo.ifBlank { "${it.nombre} ${it.apellido}" } }

        val cells = personalList
            .filter { it.rol.equals("CELL", ignoreCase = true) }

        if (administrativos.isNotEmpty()) {
            addSectionHeader("Personal Administrativo")
            administrativos.forEach { addPersonRow(it) }
        }

        if (cets.isNotEmpty() || cells.isNotEmpty()) {
            addSectionHeader("Personal Táctico")
        }

        if (cets.isNotEmpty()) {
            addSectionHeader("CET")
            cets.forEach { addPersonRow(it) }
        }

        val flotillas = cells
            .groupBy {
                when {
                    it.grupoApodo.isNotBlank() -> it.grupoApodo
                    it.grupoNombre.isNotBlank() -> it.grupoNombre
                    else -> "Sin flotilla"
                }
            }
            .toSortedMap()

        flotillas.forEach { (flotilla, personas) ->
            addSectionHeader(flotilla)
            personas
                .sortedBy { it.apodo.ifBlank { "${it.nombre} ${it.apellido}" } }
                .forEach { addPersonRow(it) }
        }
    }

    fun inflateVehiculoPanel(
        panelContent: FrameLayout,
        vehiculosList: List<VehiculoItem>
    ) {
        val view = host.getLayoutInflater().inflate(R.layout.panel_vehiculo, panelContent, false)
        panelContent.addView(view)

        val list = view.findViewById<LinearLayout>(R.id.vehiculoList)

        if (vehiculosList.isEmpty()) {
            val tv = TextView(view.context).apply {
                text = "Cargando vehículos..."
                setTextColor(Color.parseColor("#64748b"))
                textSize = 12f
                setPadding(0, 16, 0, 0)
            }
            list.addView(tv)
            return
        }

        vehiculosList.forEach { item ->
            val row = host.getLayoutInflater().inflate(R.layout.item_equipo, list, false)

            row.findViewById<TextView>(R.id.equipoIcon).text = when (item.tipo.uppercase()) {
                "INTERCEPTOR" -> "⛵"
                "BLINDADO" -> "🛡️"
                "PICKUP" -> "🚙"
                "TACTICO", "TÁCTICO" -> "🚗"
                else -> "🚘"
            }

            row.findViewById<TextView>(R.id.equipoNombre).text =
                buildString {
                    if (item.codigoInterno.isNotBlank()) {
                        append(item.codigoInterno)
                    } else if (item.nombre.isNotBlank()) {
                        append(item.nombre)
                    } else {
                        append("Vehículo")
                    }

                    if (item.alias.isNotBlank()) {
                        append(" · ")
                        append(item.alias)
                    }
                }

            row.findViewById<TextView>(R.id.equipoDetalle).text =
                when {
                    item.tipoDestino == "FLOTILLA" && item.grupoNombre.isNotBlank() -> "Flotilla: ${item.grupoNombre}"
                    item.tipoDestino == "GRUPO" && item.grupoNombre.isNotBlank() -> "Grupo: ${item.grupoNombre}"
                    item.tipoDestino == "PERSONAL" && item.asignadoAApodo.isNotBlank() -> "Asignado a: ${item.asignadoAApodo}"
                    item.detalle.isNotBlank() -> item.detalle
                    else -> "Sin asignación"
                }

            row.findViewById<TextView>(R.id.equipoTipo).text =
                if (item.tipo.isNotBlank()) item.tipo.uppercase() else "VEHÍCULO"

            list.addView(row)
        }
    }

    fun inflateEquipoPanel(
        panelContent: FrameLayout,
        equiposList: List<EquipoItem>
    ) {
        val view = host.getLayoutInflater().inflate(R.layout.panel_equipo, panelContent, false)
        panelContent.addView(view)

        val list = view.findViewById<LinearLayout>(R.id.equipoList)

        if (equiposList.isEmpty()) {
            val tv = TextView(view.context).apply {
                text = "Cargando equipo..."
                setTextColor(Color.parseColor("#64748b"))
                textSize = 12f
                setPadding(0, 16, 0, 0)
            }
            list.addView(tv)
            return
        }

        equiposList.forEach { item ->
            val row = host.getLayoutInflater().inflate(R.layout.item_equipo, list, false)

            row.findViewById<TextView>(R.id.equipoIcon).text = when (item.categoria.uppercase()) {
                "COMUNICACION" -> "📻"
                "TACTICO" -> "🛠️"
                else -> "🧰"
            }

            row.findViewById<TextView>(R.id.equipoNombre).text =
                if (item.nombre.isNotBlank()) item.nombre else "Equipo"

            row.findViewById<TextView>(R.id.equipoDetalle).text =
                when {
                    item.asignadoA.isNotBlank() -> item.asignadoA
                    item.detalle.isNotBlank() -> item.detalle
                    item.numeroSerie.isNotBlank() -> "S/N: ${item.numeroSerie}"
                    else -> "Sin asignación"
                }

            row.findViewById<TextView>(R.id.equipoTipo).text =
                if (item.categoria.isNotBlank()) item.categoria.uppercase() else "EQUIPO"

            list.addView(row)
        }
    }
}

data class ChatPanelRefs(
    val recyclerView: RecyclerView,
    val adapter: ChatAdapter,
    val input: EditText
)