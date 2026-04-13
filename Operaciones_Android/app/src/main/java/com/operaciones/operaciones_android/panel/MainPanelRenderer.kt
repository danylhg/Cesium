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
            val t = msgInput.text.toString().trim().ifEmpty { "Aviso de posicion" }
            host.sendChatMessage(t, alert = true, destinatarioRol = selectedChannel)
            msgInput.text.clear()
        }

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
                        child.setBackgroundResource(R.drawable.bg_quick_reply_selected)
                        txt.setTextColor(Color.WHITE)
                    } else {
                        child.setBackgroundResource(R.drawable.bg_quick_reply)
                        txt.setTextColor(Color.parseColor("#94a3b8"))
                    }
                }
            }

            availableChannels.forEach { channel ->
                val chip = host.getLayoutInflater()
                    .inflate(R.layout.item_quick_reply, channelsContainer, false)
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

        val quickRepliesContainer = view.findViewById<LinearLayout>(R.id.quickRepliesContainer)
        val suggestions = listOf(
            "Recibido",
            "En camino",
            "Apoyo necesario",
            "Situacion controlada",
            "Zona despejada",
            "Solicito extraccion"
        )

        suggestions.forEach { text ->
            val chip = host.getLayoutInflater()
                .inflate(R.layout.item_quick_reply, quickRepliesContainer, false)
            val replyText = chip.findViewById<TextView>(R.id.replyText)
            replyText.text = text

            if (text == "Apoyo necesario") {
                replyText.setTextColor(Color.parseColor("#ef4444"))
            }

            chip.setOnClickListener {
                host.sendChatMessage(
                    text,
                    alert = (text == "Apoyo necesario"),
                    destinatarioRol = selectedChannel
                )
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

        fun displayName(p: PersonalItem): String =
            p.apodo.ifBlank { "${p.nombre} ${p.apellido}".trim() }

        fun normalize(value: String): String = value.trim().lowercase()

        fun flotillaNombre(p: PersonalItem): String {
            val padre = p.grupoPadreNombre.trim()
            val grupo = p.grupoNombre.trim()
            return when {
                p.cetFlotilla.isNotBlank() -> p.cetFlotilla.trim()
                padre.isNotBlank() && !padre.equals("Mando Operativo", ignoreCase = true) -> padre
                grupo.isNotBlank() -> grupo
                else -> "Sin flotilla"
            }
        }

        data class CellNode(
            val item: PersonalItem,
            val flotilla: String,
            val grupo: String
        )

        val cuts = personalList
            .filter { it.rol.equals("CUT", ignoreCase = true) }
            .sortedBy { displayName(it) }

        val cets = personalList
            .filter { it.rol.equals("CET", ignoreCase = true) }
            .sortedBy { displayName(it) }

        val cellsByCet = personalList
            .filter { it.rol.equals("CELL", ignoreCase = true) }
            .groupBy { normalize(it.cetNombre) }

        cuts.forEach { cut ->
            addSectionHeader("CUT")
            addPersonRow(cut)
        }

        cets.forEach { cet ->
            val cetName     = displayName(cet)
            val cetFullName = "${cet.nombre} ${cet.apellido}".trim()
            val cetFlotilla = flotillaNombre(cet)

            // cet_nombre en la API viene como nombre+apellido; intentar ambas claves
            val cetCells = (cellsByCet[normalize(cetFullName)]
                ?: cellsByCet[normalize(cetName)]
                ?: emptyList())
                .map { cell ->
                    val padre = cell.grupoPadreNombre.trim()
                    val grupo = cell.grupoNombre.trim()
                    val isSubgrupo = padre.isNotBlank() &&
                        !padre.equals("Mando Operativo", ignoreCase = true)

                    CellNode(
                        item = cell,
                        flotilla = when {
                            cell.cetFlotilla.isNotBlank() -> cell.cetFlotilla.trim()
                            isSubgrupo -> padre
                            else -> cetFlotilla
                        },
                        grupo = if (isSubgrupo) grupo else ""
                    )
                }
                .filter { normalize(it.flotilla) == normalize(cetFlotilla) }

            fun prefijo(p: String, n: String): String {
                val s = n.trim()
                return if (s.lowercase().startsWith(p.lowercase())) s else "$p $s"
            }

            addSectionHeader("CET")
            addPersonRow(cet)
            addSectionHeader(prefijo("Flotilla", cetFlotilla))

            cetCells
                .filter { it.grupo.isBlank() }
                .sortedBy { displayName(it.item) }
                .forEach { addPersonRow(it.item) }

            cetCells
                .filter { it.grupo.isNotBlank() }
                .groupBy { it.grupo }
                .toSortedMap(String.CASE_INSENSITIVE_ORDER)
                .forEach { (grupo, integrantes) ->
                    addSectionHeader(prefijo("Grupo", grupo))
                    integrantes
                        .sortedBy { displayName(it.item) }
                        .forEach { addPersonRow(it.item) }
                }
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
                text = "Cargando vehiculos..."
                setTextColor(Color.parseColor("#64748b"))
                textSize = 12f
                setPadding(0, 16, 0, 0)
            }
            list.addView(tv)
            return
        }

        val density = view.context.resources.displayMetrics.density
        fun dp(f: Float) = (f * density + 0.5f).toInt()

        fun addLabel(text: String, hexColor: String, leftPad: Float = 0f, topPad: Float = 4f) {
            list.addView(TextView(view.context).apply {
                this.text = text
                setTextColor(Color.parseColor(hexColor))
                textSize = 11f
                setPadding(dp(leftPad), dp(topPad), 0, 0)
            })
        }

        // Agrupa filas por vehículo
        val byVehiculo = vehiculosList.groupBy { it.idVehiculo }

        for ((_, items) in byVehiculo) {
            val first = items.first()

            // ── Cabecera del vehículo ─────────────────────────────
            val row = host.getLayoutInflater().inflate(R.layout.item_equipo, list, false)

            row.findViewById<TextView>(R.id.equipoIcon).text = when (first.tipo.uppercase()) {
                "INTERCEPTOR"          -> "INT"
                "BLINDADO"             -> "BLD"
                "PICKUP"               -> "PK"
                "TACTICO", "TÁCTICO"   -> "TAC"
                else                   -> "VEH"
            }

            row.findViewById<TextView>(R.id.equipoNombre).text = when {
                first.codigoInterno.isNotBlank() && first.alias.isNotBlank() ->
                    "${first.codigoInterno} - ${first.alias}"
                first.codigoInterno.isNotBlank() -> first.codigoInterno
                first.alias.isNotBlank()         -> first.alias
                else                             -> "Vehiculo"
            }

            row.findViewById<TextView>(R.id.equipoDetalle).text = ""
            row.findViewById<TextView>(R.id.equipoTipo).text =
                if (first.tipo.isNotBlank()) first.tipo.uppercase() else "VEHICULO"

            list.addView(row)

            // ── Árbol flotilla → grupo → personal ─────────────────
            data class FlotillaNode(
                val directos: MutableList<String> = mutableListOf(),
                val grupos: LinkedHashMap<String, MutableList<String>> = LinkedHashMap()
            )

            val flotillas = LinkedHashMap<String, FlotillaNode>()
            val sinContexto = mutableListOf<String>()

            for (item in items) {
                val personal = item.asignadoAApodo.ifBlank { "" }

                val flotillaNombre: String
                val grupoNombre: String

                when {
                    item.grupoPadreNombre.isNotBlank() -> {
                        flotillaNombre = item.grupoPadreNombre
                        grupoNombre    = item.grupoNombre
                    }
                    item.grupoNombre.isNotBlank() -> {
                        if (item.tipoDestino == "FLOTILLA") {
                            flotillaNombre = item.grupoNombre
                            grupoNombre    = ""
                        } else {
                            flotillaNombre = ""
                            grupoNombre    = item.grupoNombre
                        }
                    }
                    else -> {
                        if (personal.isNotBlank()) sinContexto.add(personal)
                        continue
                    }
                }

                val flt = flotillas.getOrPut(flotillaNombre) { FlotillaNode() }
                if (grupoNombre.isNotBlank()) {
                    flt.grupos.getOrPut(grupoNombre) { mutableListOf() }
                        .also { if (personal.isNotBlank()) it.add(personal) }
                } else {
                    if (personal.isNotBlank()) flt.directos.add(personal)
                }
            }

            fun prefijo(prefijo: String, nombre: String): String {
                val n = nombre.trim()
                return if (n.lowercase().startsWith(prefijo.lowercase())) n else "$prefijo $n"
            }

            for ((flotillaNom, flt) in flotillas) {
                if (flotillaNom.isNotBlank()) {
                    addLabel(prefijo("Flotilla", flotillaNom), "#94a3b8", leftPad = 8f, topPad = 8f)
                }
                flt.directos.forEach { p -> addLabel("- $p", "#cbd5e1", leftPad = 16f, topPad = 2f) }
                for ((grupoNom, personas) in flt.grupos) {
                    addLabel(prefijo("Grupo", grupoNom), "#64748b", leftPad = 16f, topPad = 6f)
                    personas.forEach { p -> addLabel("- $p", "#cbd5e1", leftPad = 28f, topPad = 2f) }
                }
            }

            sinContexto.forEach { p -> addLabel("- $p", "#cbd5e1", leftPad = 12f, topPad = 2f) }

            // Separador entre vehículos
            list.addView(View(view.context).apply {
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, dp(10f)
                )
            })
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
                "COMUNICACION" -> "COM"
                "TACTICO" -> "TAC"
                else -> "EQP"
            }

            row.findViewById<TextView>(R.id.equipoNombre).text =
                if (item.nombre.isNotBlank()) item.nombre else "Equipo"

            row.findViewById<TextView>(R.id.equipoDetalle).text =
                when {
                    item.asignadoA.isNotBlank() -> item.asignadoA
                    item.detalle.isNotBlank() -> item.detalle
                    item.numeroSerie.isNotBlank() -> "S/N: ${item.numeroSerie}"
                    else -> "Sin asignacion"
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
