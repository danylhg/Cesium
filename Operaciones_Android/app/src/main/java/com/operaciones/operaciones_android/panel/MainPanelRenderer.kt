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
import com.operaciones.operaciones_android.model.MessageType
import com.operaciones.operaciones_android.model.PersonalItem
import com.operaciones.operaciones_android.model.User
import com.operaciones.operaciones_android.ui.adapter.ChatAdapter

class MainPanelRenderer(
    private val host: Host
) {

    interface Host {
        fun getLayoutInflater(): LayoutInflater
        fun addMessage(msg: ChatMessage)
        fun openChatPanel()
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

        sendBtn.setOnClickListener {
            val t = msgInput.text.toString().trim()
            if (t.isNotEmpty()) {
                host.addMessage(ChatMessage(currentUser.nombreCompleto, t, MessageType.NORMAL))
                msgInput.text.clear()
            }
        }

        alertBtn.setOnClickListener {
            val t = msgInput.text.toString().trim().ifEmpty { "Aviso de posición" }
            host.addMessage(ChatMessage("⚠️ ${currentUser.nombreCompleto}", t, MessageType.ALERT))
            msgInput.text.clear()
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

        personalList.forEach { p ->
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
    }

    fun inflateEquipoPanel(
        panelContent: FrameLayout,
        vehiculosList: List<EquipoItem>,
        equiposList: List<EquipoItem>
    ) {
        val view = host.getLayoutInflater().inflate(R.layout.panel_equipo, panelContent, false)
        panelContent.addView(view)

        val list = view.findViewById<LinearLayout>(R.id.equipoList)

        if (vehiculosList.isEmpty() && equiposList.isEmpty()) {
            val tv = TextView(view.context).apply {
                text = "Cargando equipo..."
                setTextColor(Color.parseColor("#64748b"))
                textSize = 12f
                setPadding(0, 16, 0, 0)
            }
            list.addView(tv)
            return
        }

        fun addRow(item: EquipoItem) {
            val row = host.getLayoutInflater().inflate(R.layout.item_equipo, list, false)

            row.findViewById<TextView>(R.id.equipoIcon).text = when {
                item.esVehiculo -> when (item.tipo.uppercase()) {
                    "INTERCEPTOR" -> "⛵"
                    "UAV", "DRON" -> "🚁"
                    "BLINDADO" -> "🛡️"
                    else -> "🚗"
                }
                else -> when (item.tipo.uppercase()) {
                    "COMUNICACION" -> "📻"
                    "TACTICO" -> "🔧"
                    "NAVEGACION" -> "🧭"
                    else -> "🔧"
                }
            }

            row.findViewById<TextView>(R.id.equipoNombre).text = item.nombre
            row.findViewById<TextView>(R.id.equipoDetalle).text = item.detalle
            row.findViewById<TextView>(R.id.equipoTipo).text = item.tipo.uppercase()

            list.addView(row)
        }

        vehiculosList.forEach { addRow(it) }
        equiposList.forEach { addRow(it) }
    }
}

data class ChatPanelRefs(
    val recyclerView: RecyclerView,
    val adapter: ChatAdapter,
    val input: EditText
)
