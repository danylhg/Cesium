package com.operaciones.operaciones_android

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
    }

    override fun getItemCount() = messages.size
}