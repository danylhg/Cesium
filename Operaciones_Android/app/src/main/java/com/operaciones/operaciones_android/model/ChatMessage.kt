package com.operaciones.operaciones_android.model

data class ChatMessage(
    val user: String,
    val text: String,
    val type: MessageType = MessageType.NORMAL
)

enum class MessageType { NORMAL, SYSTEM, ALERT }