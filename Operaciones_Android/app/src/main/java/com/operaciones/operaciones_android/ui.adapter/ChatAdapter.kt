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
        private val COLOR_NORMAL_USER = Color.parseColor("#3b82f6")
        private val COLOR_NORMAL_TEXT = Color.parseColor("#e2e8f0")
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
                holder.user.setTextColor(COLOR_NORMAL_USER)
                holder.text.setTextColor(COLOR_NORMAL_TEXT)
                holder.itemView.setBackgroundColor(Color.TRANSPARENT)
            }
        }
    }

    override fun getItemCount() = messages.size
}