package com.operaciones.operaciones_android

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

class ChatAdapter(private val messages: List<ChatMessage>)
    : RecyclerView.Adapter<ChatAdapter.ViewHolder>() {

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
        holder.user.text = msg.user
        holder.text.text = msg.text
        when (msg.type) {
            MessageType.ALERT -> {
                holder.user.setTextColor(Color.parseColor("#ef4444"))
                holder.text.setTextColor(Color.parseColor("#fca5a5"))
                holder.itemView.setBackgroundColor(Color.parseColor("#1a0505"))
            }
            MessageType.SYSTEM -> {
                holder.user.setTextColor(Color.parseColor("#64748b"))
                holder.text.setTextColor(Color.parseColor("#94a3b8"))
                holder.itemView.setBackgroundColor(Color.TRANSPARENT)
            }
            MessageType.NORMAL -> {
                holder.user.setTextColor(Color.parseColor("#3b82f6"))
                holder.text.setTextColor(Color.parseColor("#e2e8f0"))
                holder.itemView.setBackgroundColor(Color.TRANSPARENT)
            }
        }
    }

    override fun getItemCount() = messages.size
}