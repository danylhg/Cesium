package com.operaciones.operaciones_android.ui.adapter

import android.graphics.Color
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.operaciones.operaciones_android.R
import com.operaciones.operaciones_android.model.ChatMessage
import com.operaciones.operaciones_android.model.MessageType

class ChatAdapter(private val messages: List<ChatMessage>)
    : RecyclerView.Adapter<ChatAdapter.ViewHolder>() {

    companion object {
        private val COLOR_META_DEFAULT = Color.parseColor("#4a6580")
        private val COLOR_META_ADMIN = Color.parseColor("#4ade80")
        private val COLOR_META_CUT = Color.parseColor("#86efac")
        private val COLOR_META_CET = Color.parseColor("#7ecfc2")
        private val COLOR_META_ALERT = Color.parseColor("#9b5555")
        private val COLOR_TEXT_NORMAL = Color.parseColor("#e2e8f0")
        private val COLOR_TEXT_ALERT = Color.parseColor("#fca5a5")
        private val COLOR_TEXT_SYSTEM = Color.parseColor("#94a3b8")
    }

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val bubble: LinearLayout = view.findViewById(R.id.bubble)
        val meta: TextView = view.findViewById(R.id.msgMeta)
        val text: TextView = view.findViewById(R.id.msgText)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_message, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val msg = messages[position]
        val dm = holder.itemView.resources.displayMetrics
        val maxW = (dm.widthPixels * 0.78f).toInt()
        val dp64 = (64 * dm.density + 0.5f).toInt()

        holder.text.maxWidth = maxW
        holder.meta.maxWidth = maxW

        when (msg.type) {
            MessageType.SYSTEM -> {
                holder.meta.visibility = View.GONE
                holder.text.text = msg.text
                holder.text.setTextColor(COLOR_TEXT_SYSTEM)
                holder.text.textSize = 11f
                holder.text.gravity = Gravity.CENTER
                holder.bubble.setBackgroundColor(Color.TRANSPARENT)
                val p = holder.bubble.layoutParams as FrameLayout.LayoutParams
                p.gravity = Gravity.CENTER_HORIZONTAL
                p.marginStart = 0
                p.marginEnd = 0
                holder.bubble.layoutParams = p
            }

            MessageType.ALERT -> {
                holder.meta.visibility = View.VISIBLE
                holder.meta.text = buildMeta(msg)
                holder.meta.setTextColor(COLOR_META_ALERT)
                holder.text.text = msg.text
                holder.text.setTextColor(COLOR_TEXT_ALERT)
                holder.text.textSize = 13f
                holder.text.gravity = Gravity.START
                holder.bubble.setBackgroundResource(R.drawable.bg_bubble_alert)
                val p = holder.bubble.layoutParams as FrameLayout.LayoutParams
                p.gravity = if (msg.isMine) Gravity.END else Gravity.START
                p.marginStart = if (msg.isMine) dp64 else 0
                p.marginEnd = if (msg.isMine) 0 else dp64
                holder.bubble.layoutParams = p
            }

            MessageType.NORMAL -> {
                holder.meta.visibility = View.VISIBLE
                holder.meta.text = buildMeta(msg)
                holder.meta.setTextColor(metaColor(msg))
                holder.text.text = msg.text
                holder.text.setTextColor(COLOR_TEXT_NORMAL)
                holder.text.textSize = 13f
                holder.text.gravity = Gravity.START
                holder.bubble.setBackgroundResource(
                    if (msg.isMine) R.drawable.bg_bubble_sent else R.drawable.bg_bubble_recv
                )
                val p = holder.bubble.layoutParams as FrameLayout.LayoutParams
                p.gravity = if (msg.isMine) Gravity.END else Gravity.START
                p.marginStart = if (msg.isMine) dp64 else 0
                p.marginEnd = if (msg.isMine) 0 else dp64
                holder.bubble.layoutParams = p
            }
        }
    }

    override fun getItemCount() = messages.size

    private fun metaColor(msg: ChatMessage): Int = when (msg.autorRol?.uppercase()) {
        "ADMIN" -> COLOR_META_ADMIN
        "CUT" -> COLOR_META_CUT
        "CET" -> COLOR_META_CET
        else -> COLOR_META_DEFAULT
    }

    private fun buildMeta(msg: ChatMessage): String {
        val parts = mutableListOf<String>()
        if (msg.user.isNotBlank() && msg.user != "Sistema") parts.add(msg.user)
        val rol = msg.autorRol?.lowercase()?.replaceFirstChar { it.uppercase() }
        if (!rol.isNullOrBlank()) parts.add(rol)
        val dest = buildDestText(msg)
        if (dest.isNotBlank()) parts.add(dest)
        return parts.joinToString(" - ")
    }

    private fun buildDestText(msg: ChatMessage): String {
        val label = msg.destinoLabel?.trim().orEmpty()
        val tipo = msg.destinoTipo?.trim()?.uppercase().orEmpty()
        if (label.isNotBlank()) {
            return when (tipo) {
                "CETS" -> "para todos los CETs"
                "CET", "CET_SPECIFIC" -> "para CET: $label"
                "CUTS" -> "para todos los CUT"
                "CUT" -> "para CUT: $label"
                "CELL" -> "para CELL: $label"
                "FLOTILLA" -> "para flotilla: $label"
                "GRUPO" -> "para grupo: $label"
                "VEHICULO" -> "para vehiculo: $label"
                else -> "para $label"
            }
        }

        return when (msg.destinatarioRol?.trim()?.uppercase()) {
            "CET" -> "para CET"
            "CELL" -> "para CELL"
            "CUT" -> "para CUT"
            "CELL,CET" -> "para CET + CELL"
            else -> ""
        }
    }
}
