package com.operaciones.operaciones_android.ui.adapter

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.operaciones.operaciones_android.model.ChatMessage
import com.operaciones.operaciones_android.model.MessageType
import com.operaciones.operaciones_android.R

class ChatAdapter(private val messages: List<ChatMessage>)
    : RecyclerView.Adapter<ChatAdapter.ViewHolder>() {

    // Colores definidos una sola vez — evita parsear strings en cada onBindViewHolder
    companion object {
        private val COLOR_ALERT_USER  = Color.parseColor("#ef4444")
        private val COLOR_ALERT_TEXT  = Color.parseColor("#fca5a5")
        private val COLOR_ALERT_BG    = Color.parseColor("#1a0505")
        private val COLOR_SYSTEM_USER = Color.parseColor("#64748b")
        private val COLOR_SYSTEM_TEXT = Color.parseColor("#94a3b8")
        private val COLOR_NORMAL_TEXT = Color.parseColor("#e2e8f0")
        // Colores por rol del autor
        private val COLOR_ADMIN_USER  = Color.parseColor("#4ade80")   // verde oscuro
        private val COLOR_ADMIN_BG    = Color.parseColor("#0d2e1a")
        private val COLOR_CUT_USER    = Color.parseColor("#86efac")   // verde claro
        private val COLOR_CUT_BG      = Color.parseColor("#1a3d2e")
        private val COLOR_CET_USER    = Color.parseColor("#9fd9cb")   // verde transparente
        private val COLOR_CELL_USER   = Color.parseColor("#6b9e92")   // más tenue
    }

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val user: TextView = view.findViewById(R.id.msgUser)
        val text: TextView = view.findViewById(R.id.msgText)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_message, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val msg = messages[position]

        // Etiqueta del autor — muestra "[Para: CET]" si el mensaje va dirigido a CET
        holder.user.text = if (msg.destinatarioRol != null && msg.destinatarioRol != "GLOBAL") {
            val target = if (msg.destinatarioRol == "CELL,CET") "CET+CELL" else msg.destinatarioRol
            "${msg.user} [Para: $target]"
        } else {
            msg.user
        }

        holder.text.text = msg.text

        when (msg.type) {
            MessageType.ALERT -> {
                holder.user.setTextColor(COLOR_ALERT_USER)
                holder.text.setTextColor(COLOR_ALERT_TEXT)
                holder.itemView.setBackgroundColor(COLOR_ALERT_BG)
            }
            MessageType.SYSTEM -> {
                holder.user.setTextColor(COLOR_SYSTEM_USER)
                holder.text.setTextColor(COLOR_SYSTEM_TEXT)
                holder.itemView.setBackgroundColor(Color.TRANSPARENT)
            }
            MessageType.NORMAL -> {
                // Colores según rol del autor
                when (msg.autorRol?.uppercase()) {
                    "ADMIN" -> {
                        holder.user.setTextColor(COLOR_ADMIN_USER)
                        holder.itemView.setBackgroundColor(COLOR_ADMIN_BG)
                    }
                    "CUT" -> {
                        holder.user.setTextColor(COLOR_CUT_USER)
                        holder.itemView.setBackgroundColor(COLOR_CUT_BG)
                    }
                    "CET" -> {
                        holder.user.setTextColor(COLOR_CET_USER)
                        holder.itemView.setBackgroundColor(Color.TRANSPARENT)
                    }
                    else -> {
                        holder.user.setTextColor(COLOR_CELL_USER)
                        holder.itemView.setBackgroundColor(Color.TRANSPARENT)
                    }
                }
                holder.text.setTextColor(COLOR_NORMAL_TEXT)
            }
        }
    }

    override fun getItemCount() = messages.size
}