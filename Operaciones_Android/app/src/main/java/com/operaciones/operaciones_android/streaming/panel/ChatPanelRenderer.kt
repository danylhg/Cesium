package com.operaciones.operaciones_android.ui.panel

import android.graphics.Color
import android.graphics.Typeface
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
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
import com.operaciones.operaciones_android.model.PersonalItem
import com.operaciones.operaciones_android.model.User
import com.operaciones.operaciones_android.model.VehiculoItem
import com.operaciones.operaciones_android.ui.adapter.ChatAdapter

internal class ChatPanelRenderer(
    private val host: MainPanelRenderer.Host
) {
    private data class TargetEntry(
        val id: String,
        val label: String
    )

    private data class ChannelDef(
        val type: String,
        val label: String,
        val subtitle: String,
        val avatar: String,
        val targets: List<TargetEntry>,
        val destinatarioRol: String,
        val destinoTipo: String?,
        val fixedId: String? = null,
        val fixedLabel: String? = null
    )

    private data class ChatListEntry(
        val channel: ChannelDef,
        val targetIdx: Int
    )

    fun inflate(
        panelContent: FrameLayout,
        messages: MutableList<ChatMessage>,
        currentUser: User,
        personalList: List<PersonalItem>,
        vehiculosList: List<VehiculoItem>,
        onFilterChanged: (ChatChannelSelection) -> Unit = {}
    ): ChatPanelRefs {
        val view = host.getLayoutInflater().inflate(R.layout.panel_chat, panelContent, false)
        panelContent.addView(view)

        val chatRecycler = view.findViewById<RecyclerView>(R.id.chatRecycler)
        val chatEmptyState = view.findViewById<View>(R.id.chatEmptyState)
        val msgInput = view.findViewById<EditText>(R.id.msgInput)
        val sendBtn = view.findViewById<ImageButton>(R.id.sendBtn)
        val voiceBtn = view.findViewById<ImageButton>(R.id.voiceBtn)
        val cameraBtn = view.findViewById<ImageButton>(R.id.cameraBtn)
        val alertBtn = view.findViewById<View>(R.id.btnAlert)
        val chatListScreen = view.findViewById<View>(R.id.chatListScreen)
        val chatListContainer = view.findViewById<LinearLayout>(R.id.chatListContainer)
        val chatConversationScreen = view.findViewById<View>(R.id.chatConversationScreen)
        val chatBackBtn = view.findViewById<View>(R.id.chatBackBtn)
        val chatAvatar = view.findViewById<TextView>(R.id.chatAvatar)
        val chatTitle = view.findViewById<TextView>(R.id.chatTitle)
        val chatSubtitle = view.findViewById<TextView>(R.id.chatSubtitle)

        val chatAdapter = ChatAdapter(messages)
        chatRecycler.layoutManager = LinearLayoutManager(view.context).apply { stackFromEnd = true }
        chatRecycler.adapter = chatAdapter
        if (messages.isNotEmpty()) chatRecycler.scrollToPosition(messages.size - 1)

        val channelDefs = buildChannelDefs(currentUser, personalList, vehiculosList)
        var selectedChannel = channelDefs.first()
        var selectedTargetIdx = 0

        fun payloadFor(channel: ChannelDef, targetIdx: Int): Triple<String?, String?, String?> =
            if (channel.targets.isEmpty()) {
                Triple(channel.destinoTipo, channel.fixedId, channel.fixedLabel)
            } else {
                val target = channel.targets.getOrNull(targetIdx)
                Triple(channel.destinoTipo, target?.id, target?.label)
            }

        fun currentSelection(): ChatChannelSelection {
            val (tipo, id, label) = payloadFor(selectedChannel, selectedTargetIdx)
            return ChatChannelSelection(
                type = selectedChannel.type,
                destinatarioRol = selectedChannel.destinatarioRol,
                destinoTipo = tipo,
                destinoId = id,
                destinoLabel = label
            )
        }

        fun selectedTargetLabel(): String {
            if (selectedChannel.targets.isEmpty()) return selectedChannel.fixedLabel ?: selectedChannel.label
            return selectedChannel.targets.getOrNull(selectedTargetIdx)?.label ?: selectedChannel.label
        }

        fun updateConversationHeader() {
            chatAvatar.text = selectedChannel.avatar
            chatTitle.text = selectedTargetLabel()
            chatSubtitle.text = if (selectedChannel.targets.isEmpty()) {
                selectedChannel.subtitle
            } else {
                selectedChannel.label
            }
        }

        fun send(text: String, isAlert: Boolean) {
            val (tipo, id, label) = payloadFor(selectedChannel, selectedTargetIdx)
            host.sendChatMessage(
                text = text,
                alert = isAlert,
                destinatarioRol = selectedChannel.destinatarioRol,
                destinoTipo = tipo,
                destinoId = id,
                destinoLabel = label
            )
        }

        fun showChatList() {
            chatConversationScreen.visibility = View.GONE
            chatListScreen.visibility = View.VISIBLE
        }

        fun openConversation(entry: ChatListEntry) {
            selectedChannel = entry.channel
            selectedTargetIdx = entry.targetIdx
            updateConversationHeader()
            onFilterChanged(currentSelection())
            chatListScreen.visibility = View.GONE
            chatConversationScreen.visibility = View.VISIBLE
            if (messages.isNotEmpty()) chatRecycler.scrollToPosition(messages.size - 1)
        }

        populateChatList(chatListContainer, channelDefs, ::openConversation)
        chatBackBtn.setOnClickListener { showChatList() }
        updateConversationHeader()
        showChatList()

        bindSendButtons(msgInput, sendBtn, alertBtn, ::send)
        bindAttachmentButtons(voiceBtn, cameraBtn) { source ->
            val (tipo, id, label) = payloadFor(selectedChannel, selectedTargetIdx)
            host.requestChatAttachment(
                source = source,
                destinatarioRol = selectedChannel.destinatarioRol,
                destinoTipo = tipo,
                destinoId = id,
                destinoLabel = label
            )
        }
        bindQuickReplies(view, ::send, msgInput)
        onFilterChanged(currentSelection())

        return ChatPanelRefs(
            recyclerView = chatRecycler,
            adapter = chatAdapter,
            input = msgInput,
            emptyState = chatEmptyState
        )
    }

    private fun buildChannelDefs(
        currentUser: User,
        personalList: List<PersonalItem>,
        vehiculosList: List<VehiculoItem>
    ): List<ChannelDef> {
        val cuts = roleTargets(personalList, "CUT")
        val myVehicles = currentVehicleTargets(currentUser, vehiculosList)
        val myCellFlotilla = currentCellFlotillaTargets(currentUser, personalList)
        val myCellGroups = currentCellGroupTargets(currentUser, personalList)
        val myCellCets = currentCellCetTargets(currentUser, personalList)
        val myCetFlotilla = currentCetFlotillaTargets(currentUser, personalList)
        val myCetGroups = currentCetGroupTargets(currentUser, personalList)

        val rawDefs = when (currentUser.rol.name.uppercase()) {
            "CET" -> listOf(
                ChannelDef("GLOBAL", "Todos", "Operacion completa", "T", emptyList(), "GLOBAL", null),
                ChannelDef("VEHICULO", "Mi vehiculo", "Ocupantes detectados", "V", myVehicles, "CELL,CET", "CELL_LIST"),
                ChannelDef("FLOTILLA", "Mi flotilla", "CET y celulas", "F", myCetFlotilla, "CELL,CET", "FLOTILLA"),
                ChannelDef("GRUPO", "Grupos", "Grupos de mi flotilla", "G", myCetGroups, "CELL,CET", "GRUPO"),
                ChannelDef("CETS", "Todos los CET", "Mandos CET", "C", emptyList(), "CET", "CETS", "ALL", "Todos los CET"),
                ChannelDef("MY_CUT", "CUT / Admin", "Mando directo", "C", cuts, "CUT", "CUT")
            )
            "CELL" -> listOf(
                ChannelDef("GLOBAL", "Todos", "Operacion completa", "T", emptyList(), "GLOBAL", null),
                ChannelDef("VEHICULO", "Mi vehiculo", "Ocupantes detectados", "V", myVehicles, "CELL,CET", "CELL_LIST"),
                ChannelDef("FLOTILLA", "Celulas y CET", "Mi flotilla", "F", myCellFlotilla, "CELL,CET", "FLOTILLA"),
                ChannelDef("GRUPO", "Mi grupo", "Integrantes del grupo", "G", myCellGroups, "CELL,CET", "GRUPO"),
                ChannelDef("MY_CET", "Mi CET", "Chat directo", "C", myCellCets, "CET", "CET")
            )
            else -> listOf(ChannelDef("GLOBAL", "Todos", "Operacion completa", "T", emptyList(), "GLOBAL", null))
        }

        return rawDefs.filter { it.fixedId != null || it.type == "GLOBAL" || it.targets.isNotEmpty() }
    }

    private fun openChannelPicker(
        anchorView: View,
        channelDefs: List<ChannelDef>,
        selectedChannel: ChannelDef,
        selectedTargetIdx: Int,
        onApplied: (ChannelDef, Int) -> Unit
    ) {
        val sheet = BottomSheetDialog(anchorView.context)
        val sheetView = host.getLayoutInflater().inflate(R.layout.sheet_channel_picker, null)
        val channelList = sheetView.findViewById<LinearLayout>(R.id.sheetChannelList)
        val sheetSpinner = sheetView.findViewById<Spinner>(R.id.sheetTargetSpinner)
        val applyBtn = sheetView.findViewById<Button>(R.id.sheetApplyBtn)
        val rows = mutableListOf<LinearLayout>()

        var tempChannel = selectedChannel
        var tempTargetIdx = selectedTargetIdx

        fun refreshRows() = rows.forEachIndexed { index, row ->
            val selected = channelDefs[index].type == tempChannel.type
            setChannelRowSelected(row, selected)
        }

        fun refreshSheetSpinner() {
            val targets = tempChannel.targets
            if (targets.isEmpty()) {
                sheetSpinner.visibility = View.GONE
                return
            }

            sheetSpinner.adapter = makeSpinnerAdapter(anchorView, targets.map { it.label })
            sheetSpinner.setSelection(tempTargetIdx.coerceIn(0, targets.lastIndex))
            sheetSpinner.visibility = View.VISIBLE
        }

        sheetSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                tempTargetIdx = position
            }

            override fun onNothingSelected(parent: AdapterView<*>?) = Unit
        }

        var lastGroup = ""
        channelDefs.forEach { channel ->
            val group = channelGroup(channel)
            if (group != lastGroup) {
                channelList.addView(channelGroupTitle(anchorView, group))
                lastGroup = group
            }
            val row = channelRow(anchorView, channel)
            row.setOnClickListener {
                tempChannel = channel
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
            onApplied(tempChannel, tempTargetIdx)
            sheet.dismiss()
        }

        sheet.setContentView(sheetView)
        sheet.show()
    }

    private fun channelGroup(channel: ChannelDef): String = when (channel.type) {
        "CUT_SPECIFIC", "CET_SPECIFIC", "CELL_SPECIFIC", "MY_CET", "MY_CUT" -> "Personal especifico"
        else -> "Grupales"
    }

    private fun populateChatList(
        container: LinearLayout,
        channelDefs: List<ChannelDef>,
        onOpen: (ChatListEntry) -> Unit
    ) {
        container.removeAllViews()
        var lastGroup = ""

        chatListEntries(channelDefs).forEach { entry ->
            val group = channelGroup(entry.channel)
            if (group != lastGroup) {
                container.addView(channelGroupTitle(container, group))
                lastGroup = group
            }

            container.addView(chatEntryRow(container, entry).apply {
                setOnClickListener { onOpen(entry) }
            })
        }
    }

    private fun chatListEntries(channelDefs: List<ChannelDef>): List<ChatListEntry> =
        channelDefs.flatMap { channel ->
            if (channel.targets.isEmpty()) {
                listOf(ChatListEntry(channel, 0))
            } else {
                channel.targets.indices.map { targetIdx -> ChatListEntry(channel, targetIdx) }
            }
        }

    private fun chatEntryTitle(entry: ChatListEntry): String =
        entry.channel.targets.getOrNull(entry.targetIdx)?.label
            ?: entry.channel.fixedLabel
            ?: entry.channel.label

    private fun chatEntrySubtitle(entry: ChatListEntry): String =
        if (entry.channel.targets.isEmpty()) {
            entry.channel.subtitle
        } else {
            "${entry.channel.label} - ${entry.channel.subtitle}"
        }

    private fun channelGroupTitle(anchorView: View, text: String): TextView {
        val density = anchorView.context.resources.displayMetrics.density
        return TextView(anchorView.context).apply {
            this.text = text.uppercase()
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#9FB3BF"))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins((18 * density).toInt(), (10 * density).toInt(), (18 * density).toInt(), (2 * density).toInt())
            }
        }
    }

    private fun makeSpinnerAdapter(anchorView: View, items: List<String>) =
        object : ArrayAdapter<String>(anchorView.context, android.R.layout.simple_spinner_item, items) {
            private val txClr = Color.parseColor("#EEFFF9")
            private val bgClr = Color.parseColor("#18302E")

            override fun getView(position: Int, convertView: View?, parent: ViewGroup): View =
                (super.getView(position, convertView, parent) as TextView).apply {
                    setTextColor(txClr)
                    setBackgroundColor(bgClr)
                }

            override fun getDropDownView(position: Int, convertView: View?, parent: ViewGroup): View =
                ((convertView as? TextView) ?: TextView(context)).apply {
                    text = getItem(position)
                    setTextColor(txClr)
                    setBackgroundColor(bgClr)
                    textSize = 14f
                    setPadding(32, 24, 32, 24)
                }
        }

    private fun channelRow(anchorView: View, channel: ChannelDef): LinearLayout {
        val density = anchorView.context.resources.displayMetrics.density
        val row = LinearLayout(anchorView.context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding((12 * density).toInt(), (10 * density).toInt(), (12 * density).toInt(), (10 * density).toInt())
            isClickable = true
            isFocusable = true
            background = anchorView.context.getDrawable(R.drawable.bg_chat_row)
            foreground = anchorView.context.obtainStyledAttributes(
                intArrayOf(android.R.attr.selectableItemBackground)
            ).getDrawable(0)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins((12 * density).toInt(), (2 * density).toInt(), (12 * density).toInt(), (2 * density).toInt())
            }
        }

        val avatar = TextView(anchorView.context).apply {
            text = channel.avatar
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor("#00F0A8"))
            background = anchorView.context.getDrawable(R.drawable.bg_chat_avatar)
            layoutParams = LinearLayout.LayoutParams((40 * density).toInt(), (40 * density).toInt())
        }

        val textBox = LinearLayout(anchorView.context).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = (10 * density).toInt()
            }
        }

        val title = TextView(anchorView.context).apply {
            text = channel.label
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#EEFFF9"))
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
        }

        val subtitleText = if (channel.targets.isEmpty()) {
            channel.subtitle
        } else {
            "${channel.subtitle} - ${channel.targets.size} opciones"
        }
        val subtitle = TextView(anchorView.context).apply {
            text = subtitleText
            textSize = 11f
            setTextColor(Color.parseColor("#9FB3BF"))
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
        }

        textBox.addView(title)
        textBox.addView(subtitle)
        row.addView(avatar)
        row.addView(textBox)
        return row
    }

    private fun chatEntryRow(anchorView: View, entry: ChatListEntry): LinearLayout {
        val row = channelRow(anchorView, entry.channel)
        val textBox = row.getChildAt(1) as? LinearLayout ?: return row
        (textBox.getChildAt(0) as? TextView)?.text = chatEntryTitle(entry)
        (textBox.getChildAt(1) as? TextView)?.text = chatEntrySubtitle(entry)
        return row
    }

    private fun setChannelRowSelected(row: LinearLayout, selected: Boolean) {
        row.setBackgroundResource(if (selected) R.drawable.bg_chat_row_selected else R.drawable.bg_chat_row)
        val textBox = row.getChildAt(1) as? LinearLayout ?: return
        val title = textBox.getChildAt(0) as? TextView
        val subtitle = textBox.getChildAt(1) as? TextView
        title?.setTextColor(if (selected) Color.parseColor("#00F0A8") else Color.parseColor("#EEFFF9"))
        subtitle?.setTextColor(if (selected) Color.parseColor("#D6FFF2") else Color.parseColor("#9FB3BF"))
    }

    private fun bindSendButtons(
        input: EditText,
        sendBtn: ImageButton,
        alertBtn: View,
        send: (String, Boolean) -> Unit
    ) {
        sendBtn.setOnClickListener {
            val text = input.text.toString().trim()
            if (text.isNotEmpty()) {
                send(text, false)
                input.text.clear()
            }
        }

        input.setOnEditorActionListener { _, actionId, _ ->
            if (actionId != EditorInfo.IME_ACTION_SEND) return@setOnEditorActionListener false
            val text = input.text.toString().trim()
            if (text.isNotEmpty()) {
                send(text, false)
                input.text.clear()
            }
            true
        }

        alertBtn.setOnClickListener {
            val text = input.text.toString().trim().ifEmpty { "Aviso de posicion" }
            send(text, true)
            input.text.clear()
        }
    }

    private fun bindAttachmentButtons(
        voiceBtn: ImageButton,
        cameraBtn: ImageButton,
        request: (String) -> Unit
    ) {
        voiceBtn.setOnClickListener { request("voice") }
        cameraBtn.setOnClickListener { request("camera") }
    }

    private fun bindQuickReplies(
        view: View,
        send: (String, Boolean) -> Unit,
        input: EditText
    ) {
        val quickRepliesContainer = view.findViewById<LinearLayout>(R.id.quickRepliesContainer)
        listOf(
            "Recibido",
            "En camino",
            "Apoyo necesario",
            "Situacion controlada",
            "Zona despejada",
            "Solicito extraccion"
        ).forEach { text ->
            val chip = host.getLayoutInflater().inflate(R.layout.item_quick_reply, quickRepliesContainer, false)
            val tv = chip.findViewById<TextView>(R.id.replyText)
            tv.text = text
            if (text == "Apoyo necesario") tv.setTextColor(Color.parseColor("#ef4444"))
            chip.setOnClickListener {
                send(text, text == "Apoyo necesario")
                input.text.clear()
            }
            quickRepliesContainer.addView(chip)
        }
    }

    private fun roleTargets(personalList: List<PersonalItem>, rol: String): List<TargetEntry> =
        personalList
            .filter { it.rol.equals(rol, ignoreCase = true) }
            .map { TargetEntry(it.idPersonal.toString(), personName(it)) }
            .sortedBy { it.label }

    private fun currentCellFlotillaTargets(
        currentUser: User,
        personalList: List<PersonalItem>
    ): List<TargetEntry> =
        currentCell(currentUser, personalList)
            ?.let(::flotillaTarget)
            ?.let(::listOf)
            .orEmpty()

    private fun currentCellGroupTargets(
        currentUser: User,
        personalList: List<PersonalItem>
    ): List<TargetEntry> =
        currentCell(currentUser, personalList)
            ?.let(::groupTarget)
            ?.let(::listOf)
            .orEmpty()

    private fun currentCetFlotillaTargets(
        currentUser: User,
        personalList: List<PersonalItem>
    ): List<TargetEntry> =
        currentCet(currentUser, personalList)
            ?.let(::flotillaTarget)
            ?.let(::listOf)
            .orEmpty()

    private fun currentCetGroupTargets(
        currentUser: User,
        personalList: List<PersonalItem>
    ): List<TargetEntry> =
        cellsForCet(currentUser, personalList)
            .mapNotNull(::groupTarget)
            .distinctBy { it.id.ifBlank { it.label.trim().lowercase() } }
            .sortedBy { it.label }

    private fun currentCellCetTargets(
        currentUser: User,
        personalList: List<PersonalItem>
    ): List<TargetEntry> {
        val cell = currentCell(currentUser, personalList) ?: return emptyList()
        val assignedCet = normalizeName(cell.cetNombre)
        if (assignedCet.isBlank()) return emptyList()

        return personalList
            .filter { person ->
                person.rol.equals("CET", ignoreCase = true) &&
                    assignedCet in cetNames(person)
            }
            .map { TargetEntry(it.idPersonal.toString(), personName(it)) }
            .distinctBy { it.id }
            .sortedBy { it.label }
    }

    private fun currentCell(currentUser: User, personalList: List<PersonalItem>): PersonalItem? =
        personalList.firstOrNull {
            it.idPersonal == currentUser.id && it.rol.equals("CELL", ignoreCase = true)
        }

    private fun currentCet(currentUser: User, personalList: List<PersonalItem>): PersonalItem? =
        personalList.firstOrNull {
            it.idPersonal == currentUser.id && it.rol.equals("CET", ignoreCase = true)
        }

    private fun cellsForCet(currentUser: User, personalList: List<PersonalItem>): List<PersonalItem> {
        val cet = currentCet(currentUser, personalList) ?: return emptyList()
        val aliases = cetNames(cet)
        if (aliases.isEmpty()) return emptyList()

        return personalList.filter { person ->
            person.rol.equals("CELL", ignoreCase = true) &&
                normalizeName(person.cetNombre) in aliases
        }
    }

    private fun cetNames(person: PersonalItem): Set<String> =
        setOf(
            normalizeName(personName(person)),
            normalizeName("${person.nombre} ${person.apellido}")
        ).filterTo(linkedSetOf()) { it.isNotBlank() }

    private fun groupTarget(person: PersonalItem): TargetEntry? {
        val padre = person.grupoPadreNombre.trim()
        val grupo = person.grupoNombre.trim()
        if (
            grupo.isBlank() ||
            padre.isBlank() ||
            padre.equals("Mando Operativo", ignoreCase = true)
        ) {
            return null
        }

        return TargetEntry(person.idGrupoOperacion?.toString() ?: grupo, "$grupo ($padre)")
    }

    private fun vehicleTargets(vehiculosList: List<VehiculoItem>): List<TargetEntry> =
        vehiculosList
            .filter { it.idVehiculo > 0 && it.idPersonalAsignado != null }
            .groupBy { it.idVehiculo }
            .mapNotNull { (_, assignments) ->
                val first = assignments.firstOrNull() ?: return@mapNotNull null
                val occupantIds = assignments
                    .mapNotNull { it.idPersonalAsignado }
                    .filter { it > 0 }
                    .distinct()
                if (occupantIds.isEmpty()) return@mapNotNull null

                val label = first.alias.ifBlank { first.codigoInterno }
                    .ifBlank { first.nombre }
                    .ifBlank { "Vehiculo ${first.idVehiculo}" }
                TargetEntry(occupantIds.joinToString(","), label)
            }
            .sortedBy { it.label }

    private fun currentVehicleTargets(
        currentUser: User,
        vehiculosList: List<VehiculoItem>
    ): List<TargetEntry> {
        val myVehicleIds = vehiculosList
            .filter { it.idPersonalAsignado == currentUser.id }
            .map { it.idVehiculo }
            .filter { it > 0 }
            .toSet()

        if (myVehicleIds.isEmpty()) return emptyList()
        return vehicleTargets(vehiculosList.filter { it.idVehiculo in myVehicleIds })
    }

    private fun flotillaTarget(person: PersonalItem): TargetEntry? {
        val padre = person.grupoPadreNombre.trim()
        val grupo = person.grupoNombre.trim()

        return when {
            person.cetFlotilla.isNotBlank() -> TargetEntry(
                person.idGrupoPadre?.toString() ?: person.cetFlotilla.trim(),
                person.cetFlotilla.trim()
            )
            padre.isNotBlank() && !padre.equals("Mando Operativo", ignoreCase = true) -> TargetEntry(
                person.idGrupoPadre?.toString() ?: padre,
                padre
            )
            grupo.isNotBlank() -> TargetEntry(
                person.idGrupoOperacion?.toString() ?: grupo,
                grupo
            )
            else -> null
        }
    }

    private fun personName(person: PersonalItem): String =
        person.apodo.ifBlank { "${person.nombre} ${person.apellido}".trim() }

    private fun normalizeName(value: String): String = value.trim().lowercase()
}
