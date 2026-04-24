package com.operaciones.operaciones_android.ui.panel

import android.graphics.Color
import android.graphics.Typeface
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.bottomsheet.BottomSheetDialog
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

        val simulationBtn = view.findViewById<Button>(R.id.btnSimulacion)
        if (host.shouldShowSimulationButton()) {
            simulationBtn.visibility = View.VISIBLE

            fun refreshSimulationText() {
                simulationBtn.text = if (host.isSimulationActive()) {
                    "Detener simulacion"
                } else {
                    "Activar simulacion"
                }
            }

            refreshSimulationText()
            simulationBtn.setOnClickListener {
                host.toggleSimulation()
                refreshSimulationText()
            }
        } else {
            simulationBtn.visibility = View.GONE
        }
    }

    fun inflateChatPanel(
        panelContent: FrameLayout,
        messages: MutableList<ChatMessage>,
        currentUser: User,
        personalList: List<PersonalItem>
    ): ChatPanelRefs {
        val view = host.getLayoutInflater().inflate(R.layout.panel_chat, panelContent, false)
        panelContent.addView(view)

        val chatRecycler = view.findViewById<RecyclerView>(R.id.chatRecycler)
        val msgInput     = view.findViewById<EditText>(R.id.msgInput)
        val sendBtn      = view.findViewById<ImageButton>(R.id.sendBtn)
        val alertBtn     = view.findViewById<View>(R.id.btnAlert)

        val chatAdapter = ChatAdapter(messages)
        chatRecycler.layoutManager = LinearLayoutManager(view.context).apply { stackFromEnd = true }
        chatRecycler.adapter = chatAdapter
        if (messages.isNotEmpty()) chatRecycler.scrollToPosition(messages.size - 1)

        // ── Directorio ─────────────────────────────────────────────
        data class TargetEntry(val id: String, val label: String)

        fun pName(p: PersonalItem): String = p.apodo.ifBlank { "${p.nombre} ${p.apellido}".trim() }

        fun flotillaTarget(p: PersonalItem): TargetEntry? {
            val padre = p.grupoPadreNombre.trim()
            val grupo = p.grupoNombre.trim()
            return when {
                p.cetFlotilla.isNotBlank() -> TargetEntry(
                    p.idGrupoPadre?.toString() ?: p.cetFlotilla.trim(),
                    p.cetFlotilla.trim()
                )
                padre.isNotBlank() && !padre.equals("Mando Operativo", ignoreCase = true) -> TargetEntry(
                    p.idGrupoPadre?.toString() ?: padre,
                    padre
                )
                grupo.isNotBlank() -> TargetEntry(
                    p.idGrupoOperacion?.toString() ?: grupo,
                    grupo
                )
                else -> null
            }
        }

        fun roleTargets(rol: String) = personalList
            .filter { it.rol.equals(rol, ignoreCase = true) }
            .map { TargetEntry(it.idPersonal.toString(), pName(it)) }
            .sortedBy { it.label }

        val cuts      = roleTargets("CUT")
        val cets      = roleTargets("CET")
        val cells     = roleTargets("CELL")
        val flotillas = personalList
            .mapNotNull { flotillaTarget(it) }
            .distinctBy { it.id.ifBlank { it.label.trim().lowercase() } }
            .sortedBy { it.label }
        val grupos    = personalList
            .mapNotNull { p ->
                val padre = p.grupoPadreNombre.trim()
                val grupo = p.grupoNombre.trim()
                if (grupo.isNotBlank() && padre.isNotBlank() &&
                    !padre.equals("Mando Operativo", ignoreCase = true)) {
                    val id = p.idGrupoOperacion?.toString() ?: grupo
                    val label = "$grupo ($padre)"
                    TargetEntry(id, label)
                } else null
            }
            .distinctBy { it.id.ifBlank { it.label.trim().lowercase() } }
            .sortedBy { it.label }

        // ── Definición de canales ──────────────────────────────────
        data class ChannelDef(
            val type: String,
            val label: String,
            val targets: List<TargetEntry>,
            val destinatarioRol: String,
            val destinoTipo: String?,
            val fixedId: String? = null,
            val fixedLabel: String? = null
        )

        val userRol = currentUser.rol.name.uppercase()

        val rawDefs: List<ChannelDef> = when (userRol) {
            "CET" -> listOf(
                ChannelDef("GLOBAL",        "Global (a todos)",  emptyList(), "GLOBAL",   null),
                ChannelDef("CUTS",          "Todos los CUT",     emptyList(), "CUT",      "CUTS",  "ALL", "Todos los CUT"),
                ChannelDef("CUT_SPECIFIC",  "CUT específico",    cuts,        "CUT",      "CUT"),
                ChannelDef("CETS",          "Todos los CETs",    emptyList(), "CET",      "CETS",  "ALL", "Todos los CETs"),
                ChannelDef("CET_SPECIFIC",  "CET específico",    cets,        "CET",      "CET"),
                ChannelDef("CELL_SPECIFIC", "CELL específico",   cells,       "CELL",     "CELL"),
                ChannelDef("FLOTILLA",      "Flotilla",          flotillas,   "CELL,CET", "FLOTILLA"),
                ChannelDef("GRUPO",         "Grupo específico",  grupos,      "CELL,CET", "GRUPO"),
            )
            "CELL" -> listOf(
                ChannelDef("GLOBAL",        "Global (a todos)",  emptyList(), "GLOBAL",   null),
                ChannelDef("CETS",          "Todos los CETs",    emptyList(), "CET",      "CETS",  "ALL", "Todos los CETs"),
                ChannelDef("CET_SPECIFIC",  "CET específico",    cets,        "CET",      "CET"),
                ChannelDef("CELL_SPECIFIC", "CELL específico",   cells,       "CELL",     "CELL"),
                ChannelDef("FLOTILLA",      "Flotilla",          flotillas,   "CELL,CET", "FLOTILLA"),
                ChannelDef("GRUPO",         "Grupo específico",  grupos,      "CELL,CET", "GRUPO"),
            )
            else -> listOf(ChannelDef("GLOBAL", "Global (a todos)", emptyList(), "GLOBAL", null))
        }

        val channelDefs = rawDefs.filter { ch ->
            ch.fixedId != null || ch.type == "GLOBAL" || ch.targets.isNotEmpty()
        }

        // ── Estado ────────────────────────────────────────────────
        var selectedChannel   = channelDefs.first()
        var selectedTargetIdx = 0

        // ── Vistas del panel ──────────────────────────────────────
        val channelSelector = view.findViewById<View>(R.id.channelSelector)
        val destBtn         = view.findViewById<TextView>(R.id.destBtn)

        fun destLabel(): String {
            val ch = selectedChannel
            if (ch.targets.isEmpty()) return "${ch.label}  ▼"
            val t = ch.targets.getOrNull(selectedTargetIdx)
            return "${t?.label ?: ch.label}  ▼"
        }

        fun buildPayload(): Triple<String?, String?, String?> {
            val ch = selectedChannel
            return if (ch.targets.isEmpty()) {
                Triple(ch.destinoTipo, ch.fixedId, ch.fixedLabel)
            } else {
                val t = ch.targets.getOrNull(selectedTargetIdx)
                Triple(ch.destinoTipo, t?.id, t?.label)
            }
        }

        fun send(text: String, isAlert: Boolean) {
            val (tipo, id, label) = buildPayload()
            host.sendChatMessage(
                text            = text,
                alert           = isAlert,
                destinatarioRol = selectedChannel.destinatarioRol,
                destinoTipo     = tipo,
                destinoId       = id,
                destinoLabel    = label
            )
        }

        // ── Spinner adapter (reutilizable) ────────────────────────
        fun makeSpinnerAdapter(items: List<String>) =
            object : ArrayAdapter<String>(view.context, android.R.layout.simple_spinner_item, items) {
                private val txClr = Color.parseColor("#e2e8f0")
                private val bgClr = Color.parseColor("#1e293b")
                override fun getView(pos: Int, cv: View?, parent: ViewGroup): View =
                    (super.getView(pos, cv, parent) as TextView)
                        .apply { setTextColor(txClr); setBackgroundColor(bgClr) }
                override fun getDropDownView(pos: Int, cv: View?, parent: ViewGroup): View =
                    ((cv as? TextView) ?: TextView(context)).apply {
                        text = getItem(pos)
                        setTextColor(txClr); setBackgroundColor(bgClr)
                        textSize = 14f; setPadding(32, 24, 32, 24)
                    }
            }

        // ── Bottom sheet selector de destino ──────────────────────
        fun openChannelPicker() {
            val sheet      = BottomSheetDialog(view.context)
            val sheetView  = host.getLayoutInflater().inflate(R.layout.sheet_channel_picker, null)
            val channelList  = sheetView.findViewById<LinearLayout>(R.id.sheetChannelList)
            val sheetSpinner = sheetView.findViewById<Spinner>(R.id.sheetTargetSpinner)
            val applyBtn     = sheetView.findViewById<Button>(R.id.sheetApplyBtn)

            var tempChannel   = selectedChannel
            var tempTargetIdx = selectedTargetIdx

            val rows = mutableListOf<TextView>()

            fun refreshRows() = rows.forEachIndexed { i, row ->
                val sel = channelDefs[i].type == tempChannel.type
                row.setBackgroundColor(if (sel) Color.parseColor("#1e3a5f") else Color.TRANSPARENT)
                row.setTextColor(if (sel) Color.WHITE else Color.parseColor("#cbd5e1"))
                row.setTypeface(null, if (sel) Typeface.BOLD else Typeface.NORMAL)
            }

            fun refreshSheetSpinner() {
                val targets = tempChannel.targets
                if (targets.isEmpty()) {
                    sheetSpinner.visibility = View.GONE
                } else {
                    sheetSpinner.adapter = makeSpinnerAdapter(targets.map { it.label })
                    sheetSpinner.setSelection(tempTargetIdx.coerceIn(0, targets.lastIndex))
                    sheetSpinner.visibility = View.VISIBLE
                }
            }

            sheetSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) { tempTargetIdx = pos }
                override fun onNothingSelected(p: AdapterView<*>?) {}
            }

            channelDefs.forEach { ch ->
                val dp = view.context.resources.displayMetrics.density
                val row = TextView(view.context).apply {
                    text      = ch.label
                    textSize  = 14f
                    setTextColor(Color.parseColor("#cbd5e1"))
                    setPadding((16 * dp).toInt(), (14 * dp).toInt(), (16 * dp).toInt(), (14 * dp).toInt())
                    isClickable = true; isFocusable = true
                    foreground = view.context.obtainStyledAttributes(
                        intArrayOf(android.R.attr.selectableItemBackground)
                    ).getDrawable(0)
                }
                row.setOnClickListener {
                    tempChannel   = ch
                    tempTargetIdx = 0
                    refreshRows()
                    refreshSheetSpinner()
                }
                rows.add(row)
                channelList.addView(row)
            }

            refreshRows()
            refreshSheetSpinner()

            applyBtn.setOnClickListener {
                selectedChannel   = tempChannel
                selectedTargetIdx = tempTargetIdx
                destBtn.text      = destLabel()
                sheet.dismiss()
            }

            sheet.setContentView(sheetView)
            sheet.show()
        }

        // ── Inicializar destBtn ───────────────────────────────────
        if (channelDefs.size <= 1) {
            channelSelector.visibility = View.GONE
        } else {
            channelSelector.visibility = View.VISIBLE
            destBtn.text = destLabel()
            destBtn.setOnClickListener { openChannelPicker() }
        }

        // ── Botones de envío ──────────────────────────────────────
        sendBtn.setOnClickListener {
            val t = msgInput.text.toString().trim()
            if (t.isNotEmpty()) { send(t, false); msgInput.text.clear() }
        }
        alertBtn.setOnClickListener {
            val t = msgInput.text.toString().trim().ifEmpty { "Aviso de posición" }
            send(t, true); msgInput.text.clear()
        }

        // ── Respuestas rápidas ────────────────────────────────────
        val quickRepliesContainer = view.findViewById<LinearLayout>(R.id.quickRepliesContainer)
        listOf("Recibido", "En camino", "Apoyo necesario", "Situacion controlada",
               "Zona despejada", "Solicito extraccion").forEach { text ->
            val chip = host.getLayoutInflater().inflate(R.layout.item_quick_reply, quickRepliesContainer, false)
            val tv   = chip.findViewById<TextView>(R.id.replyText)
            tv.text  = text
            if (text == "Apoyo necesario") tv.setTextColor(Color.parseColor("#ef4444"))
            chip.setOnClickListener { send(text, text == "Apoyo necesario"); msgInput.text.clear() }
            quickRepliesContainer.addView(chip)
        }

        return ChatPanelRefs(recyclerView = chatRecycler, adapter = chatAdapter, input = msgInput)
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

            fun displayName(item: VehiculoItem): String {
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

            val cets = LinkedHashMap<String, LinkedHashMap<String, FlotillaNode>>()
            val sinContexto = mutableListOf<String>()

            for (item in items) {
                val personal = displayName(item).ifBlank { "" }
                val cetNombre = item.cetNombre.ifBlank { "Sin CET" }

                val flotillaNombre: String
                val grupoNombre: String

                when {
                    item.grupoPadreNombre.isNotBlank() -> {
                        flotillaNombre = item.grupoPadreNombre
                        grupoNombre    = item.grupoNombre
                    }
                    item.grupoNombre.isNotBlank() -> {
                        if (item.tipoDestino == "GRUPO") {
                            flotillaNombre = ""
                            grupoNombre    = item.grupoNombre
                        } else {
                            flotillaNombre = item.grupoNombre
                            grupoNombre    = ""
                        }
                    }
                    else -> {
                        if (personal.isNotBlank()) sinContexto.add(personal)
                        continue
                    }
                }

                val flotillas = cets.getOrPut(cetNombre) { LinkedHashMap() }
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

            for ((cetNombre, flotillas) in cets) {
                addLabel("$cetNombre (CET)", "#e2e8f0", leftPad = 8f, topPad = 8f)
                for ((flotillaNom, flt) in flotillas) {
                    if (flotillaNom.isNotBlank()) {
                        addLabel(prefijo("Flotilla", flotillaNom), "#94a3b8", leftPad = 16f, topPad = 8f)
                    }
                    flt.directos.forEach { p -> addLabel("-- $p", "#cbd5e1", leftPad = 28f, topPad = 2f) }
                    for ((grupoNom, personas) in flt.grupos) {
                        addLabel(prefijo("Grupo", grupoNom), "#64748b", leftPad = 28f, topPad = 6f)
                        personas.forEach { p -> addLabel("-- $p", "#cbd5e1", leftPad = 40f, topPad = 2f) }
                    }
                }
            }

            sinContexto.forEach { p -> addLabel("-- $p", "#cbd5e1", leftPad = 12f, topPad = 2f) }

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

        val density = view.context.resources.displayMetrics.density
        fun dp(f: Float) = (f * density + 0.5f).toInt()

        fun addSectionHeader(text: String) {
            list.addView(TextView(view.context).apply {
                this.text = text
                setTextColor(Color.parseColor("#a0c4ff"))
                textSize = 13f
                setPadding(0, dp(8f), 0, dp(8f))
            })
        }

        fun uniqueNonBlank(values: List<String>): List<String> =
            values.map { it.trim() }.filter { it.isNotBlank() }.distinct()

        fun destinationText(item: EquipoItem): String = when {
            item.vehiculoAsignado.isNotBlank() -> item.vehiculoAsignado
            item.personalAsignado.isNotBlank() -> item.personalAsignado
            item.asignadoA.isNotBlank() -> item.asignadoA
            else -> "Sin destino"
        }

        val groups = listOf(
            "Equipos de Comunicacion" to equiposList.filter { it.categoria.equals("COMUNICACION", ignoreCase = true) },
            "Equipos Tacticos" to equiposList.filter { it.categoria.equals("TACTICO", ignoreCase = true) },
            "Otros equipos" to equiposList.filter {
                !it.categoria.equals("COMUNICACION", ignoreCase = true) &&
                    !it.categoria.equals("TACTICO", ignoreCase = true)
            }
        ).filter { it.second.isNotEmpty() }

        groups.forEach { (title, items) ->
            addSectionHeader(title)

            items.forEach { item ->
                val row = host.getLayoutInflater().inflate(R.layout.item_equipo, list, false)

                row.findViewById<TextView>(R.id.equipoIcon).text = when (item.categoria.uppercase()) {
                    "COMUNICACION" -> "COM"
                    "TACTICO" -> "TAC"
                    else -> "EQP"
                }

                row.findViewById<TextView>(R.id.equipoNombre).text =
                    "Nombre de equipo: ${if (item.nombre.isNotBlank()) item.nombre else "Equipo"}"

                val flotillas = uniqueNonBlank(item.flotillasVinculadas)
                val grupos = uniqueNonBlank(item.gruposVinculados)
                val contextValues = (flotillas + grupos).map { it.trim().lowercase() }.toSet()
                val destino = destinationText(item)
                val showDestino = destino.isNotBlank() &&
                    !destino.equals("Sin destino", ignoreCase = true) &&
                    !contextValues.contains(destino.trim().lowercase())

                row.findViewById<TextView>(R.id.equipoDetalle).text = buildString {
                    append("Numero: ")
                    append(if (item.numeroSerie.isNotBlank()) item.numeroSerie else "Sin numero")
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

                row.findViewById<TextView>(R.id.equipoTipo).text = ""

                list.addView(row)
            }
        }
    }
}

data class ChatPanelRefs(
    val recyclerView: RecyclerView,
    val adapter: ChatAdapter,
    val input: EditText
)
