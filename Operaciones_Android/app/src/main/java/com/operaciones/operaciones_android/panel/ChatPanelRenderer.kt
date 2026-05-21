package com.operaciones.operaciones_android.ui.panel

import android.graphics.Color
import android.graphics.Typeface
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
import com.operaciones.operaciones_android.model.PersonalItem
import com.operaciones.operaciones_android.model.User
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

    fun inflate(
        panelContent: FrameLayout,
        messages: MutableList<ChatMessage>,
        currentUser: User,
        personalList: List<PersonalItem>,
        onFilterChanged: (ChatChannelSelection) -> Unit = {}
    ): ChatPanelRefs {
        val view = host.getLayoutInflater().inflate(R.layout.panel_chat, panelContent, false)
        panelContent.addView(view)

        val chatRecycler = view.findViewById<RecyclerView>(R.id.chatRecycler)
        val msgInput = view.findViewById<EditText>(R.id.msgInput)
        val sendBtn = view.findViewById<ImageButton>(R.id.sendBtn)
        val voiceBtn = view.findViewById<ImageButton>(R.id.voiceBtn)
        val cameraBtn = view.findViewById<ImageButton>(R.id.cameraBtn)
        val alertBtn = view.findViewById<View>(R.id.btnAlert)
        val channelSelector = view.findViewById<View>(R.id.channelSelector)
        val chatAvatar = view.findViewById<TextView>(R.id.chatAvatar)
        val chatTitle = view.findViewById<TextView>(R.id.chatTitle)
        val chatSubtitle = view.findViewById<TextView>(R.id.chatSubtitle)
        val destBtn = view.findViewById<TextView>(R.id.destBtn)

        val chatAdapter = ChatAdapter(messages)
        chatRecycler.layoutManager = LinearLayoutManager(view.context).apply { stackFromEnd = true }
        chatRecycler.adapter = chatAdapter
        if (messages.isNotEmpty()) chatRecycler.scrollToPosition(messages.size - 1)

        val channelDefs = buildChannelDefs(currentUser, personalList)
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
            destBtn.text = "Chats"
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

        fun openChannelPicker() {
            openChannelPicker(
                anchorView = view,
                channelDefs = channelDefs,
                selectedChannel = selectedChannel,
                selectedTargetIdx = selectedTargetIdx
            ) { channel, targetIdx ->
                selectedChannel = channel
                selectedTargetIdx = targetIdx
                updateConversationHeader()
                onFilterChanged(currentSelection())
            }
        }

        if (channelDefs.size <= 1) {
            destBtn.visibility = View.GONE
        } else {
            channelSelector.visibility = View.VISIBLE
            destBtn.setOnClickListener { openChannelPicker() }
        }
        updateConversationHeader()

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

        return ChatPanelRefs(recyclerView = chatRecycler, adapter = chatAdapter, input = msgInput)
    }

    private fun buildChannelDefs(
        currentUser: User,
        personalList: List<PersonalItem>
    ): List<ChannelDef> {
        val cuts = roleTargets(personalList, "CUT")
        val cets = roleTargets(personalList, "CET")
        val cells = roleTargets(personalList, "CELL")
        val flotillas = flotillaTargets(personalList)
        val grupos = groupTargets(personalList)

        val rawDefs = when (currentUser.rol.name.uppercase()) {
            "CET" -> listOf(
                ChannelDef("GLOBAL", "Todos", "Operacion completa", "T", emptyList(), "GLOBAL", null),
                ChannelDef("CUTS", "Todos los CUT", "Mandos CUT", "C", emptyList(), "CUT", "CUTS", "ALL", "Todos los CUT"),
                ChannelDef("CUT_SPECIFIC", "CUT", "Un mando operativo", "C", cuts, "CUT", "CUT"),
                ChannelDef("CETS", "Todos los CET", "Mandos CET", "C", emptyList(), "CET", "CETS", "ALL", "Todos los CET"),
                ChannelDef("CET_SPECIFIC", "CET", "Un coordinador", "C", cets, "CET", "CET"),
                ChannelDef("CELL_SPECIFIC", "Personal especifico", "Una persona", "P", cells, "CELL", "CELL"),
                ChannelDef("FLOTILLA", "Flotilla", "CET e integrantes", "F", flotillas, "CELL,CET", "FLOTILLA"),
                ChannelDef("GRUPO", "Grupo", "Integrantes del grupo", "G", grupos, "CELL,CET", "GRUPO")
            )
            "CELL" -> listOf(
                ChannelDef("GLOBAL", "Todos", "Operacion completa", "T", emptyList(), "GLOBAL", null),
                ChannelDef("CETS", "Todos los CET", "Mandos CET", "C", emptyList(), "CET", "CETS", "ALL", "Todos los CET"),
                ChannelDef("CET_SPECIFIC", "CET", "Un coordinador", "C", cets, "CET", "CET"),
                ChannelDef("CELL_SPECIFIC", "Personal especifico", "Una persona", "P", cells, "CELL", "CELL"),
                ChannelDef("FLOTILLA", "Flotilla", "CET e integrantes", "F", flotillas, "CELL,CET", "FLOTILLA"),
                ChannelDef("GRUPO", "Grupo", "Integrantes del grupo", "G", grupos, "CELL,CET", "GRUPO")
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

        channelDefs.forEach { channel ->
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

    private fun makeSpinnerAdapter(anchorView: View, items: List<String>) =
        object : ArrayAdapter<String>(anchorView.context, android.R.layout.simple_spinner_item, items) {
            private val txClr = Color.parseColor("#e2e8f0")
            private val bgClr = Color.parseColor("#1e293b")

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
            gravity = android.view.Gravity.CENTER_VERTICAL
            setPadding((14 * density).toInt(), (12 * density).toInt(), (14 * density).toInt(), (12 * density).toInt())
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
                setMargins((12 * density).toInt(), (5 * density).toInt(), (12 * density).toInt(), (5 * density).toInt())
            }
        }

        val avatar = TextView(anchorView.context).apply {
            text = channel.avatar
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            gravity = android.view.Gravity.CENTER
            setTextColor(Color.WHITE)
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
            setTextColor(Color.parseColor("#e2e8f0"))
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }

        val subtitleText = if (channel.targets.isEmpty()) {
            channel.subtitle
        } else {
            "${channel.subtitle} - ${channel.targets.size} opciones"
        }
        val subtitle = TextView(anchorView.context).apply {
            text = subtitleText
            textSize = 11f
            setTextColor(Color.parseColor("#94a3b8"))
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }

        textBox.addView(title)
        textBox.addView(subtitle)
        row.addView(avatar)
        row.addView(textBox)
        return row
    }

    private fun setChannelRowSelected(row: LinearLayout, selected: Boolean) {
        row.setBackgroundResource(if (selected) R.drawable.bg_chat_row_selected else R.drawable.bg_chat_row)
        val textBox = row.getChildAt(1) as? LinearLayout ?: return
        val title = textBox.getChildAt(0) as? TextView
        val subtitle = textBox.getChildAt(1) as? TextView
        title?.setTextColor(if (selected) Color.WHITE else Color.parseColor("#e2e8f0"))
        subtitle?.setTextColor(if (selected) Color.parseColor("#7dd3fc") else Color.parseColor("#94a3b8"))
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

    private fun flotillaTargets(personalList: List<PersonalItem>): List<TargetEntry> =
        personalList
            .mapNotNull { flotillaTarget(it) }
            .distinctBy { it.id.ifBlank { it.label.trim().lowercase() } }
            .sortedBy { it.label }

    private fun groupTargets(personalList: List<PersonalItem>): List<TargetEntry> =
        personalList
            .mapNotNull { person ->
                val padre = person.grupoPadreNombre.trim()
                val grupo = person.grupoNombre.trim()
                if (
                    grupo.isNotBlank() &&
                    padre.isNotBlank() &&
                    !padre.equals("Mando Operativo", ignoreCase = true)
                ) {
                    TargetEntry(person.idGrupoOperacion?.toString() ?: grupo, "$grupo ($padre)")
                } else {
                    null
                }
            }
            .distinctBy { it.id.ifBlank { it.label.trim().lowercase() } }
            .sortedBy { it.label }

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
}
