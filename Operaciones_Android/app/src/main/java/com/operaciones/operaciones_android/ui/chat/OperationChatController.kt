package com.operaciones.operaciones_android.ui.chat

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import androidx.recyclerview.widget.RecyclerView
import com.operaciones.operaciones_android.model.ChatMessage
import com.operaciones.operaciones_android.model.MessageType
import com.operaciones.operaciones_android.model.PersonalItem
import com.operaciones.operaciones_android.model.User
import com.operaciones.operaciones_android.network.ChatRepository
import com.operaciones.operaciones_android.ui.panel.ChatChannelSelection
import com.operaciones.operaciones_android.ui.panel.ChatPanelRefs
import com.operaciones.operaciones_android.ui.adapter.ChatAdapter
import org.json.JSONObject

class OperationChatController(
    private val repository: ChatRepository = ChatRepository(),
    private val host: Host,
    private val vibrationController: ChatVibrationController? = null,
    private val mainHandler: Handler = Handler(Looper.getMainLooper())
) {
    interface Host {
        fun getChatOperationId(): Int
        fun getChatToken(): String
        fun getChatCurrentUser(): User
        fun getChatPersonal(): List<PersonalItem>
        fun getChatContentResolver(): android.content.ContentResolver
        fun onChatMessageAdded(message: ChatMessage, visibleInActiveChat: Boolean)
        fun onChatVisibleMessagesRead(messages: List<ChatMessage>)
    }

    private val messages = mutableListOf<ChatMessage>()
    val visibleMessages = mutableListOf<ChatMessage>()

    private var chatLoaded = false
    private var activeSelection = ChatChannelSelection(
        type = "GLOBAL",
        destinatarioRol = "GLOBAL"
    )
    private var chatAdapter: ChatAdapter? = null
    private var chatRecycler: RecyclerView? = null
    private var chatEmptyState: View? = null

    fun bindPanel(refs: ChatPanelRefs) {
        chatRecycler = refs.recyclerView
        chatAdapter = refs.adapter
        chatEmptyState = refs.emptyState
        refreshVisibleMessages()
    }

    fun setActiveSelection(selection: ChatChannelSelection) {
        activeSelection = selection
        refreshVisibleMessages()
    }

    fun addMessage(msg: ChatMessage) {
        mainHandler.post {
            val exists = msg.id != null && messages.any { it.id == msg.id }
            if (exists) return@post

            val visibleInActiveChat = isVisibleInActiveChatFilter(msg)

            messages.add(msg)
            vibrationController?.vibrateForMessage(msg)
            host.onChatMessageAdded(msg, visibleInActiveChat)

            if (visibleInActiveChat) {
                visibleMessages.add(msg)
            } else {
                return@post
            }

            chatAdapter?.notifyItemInserted(visibleMessages.size - 1)
            chatRecycler?.scrollToPosition(visibleMessages.size - 1)
            syncEmptyState()
        }
    }

    fun addMessageFromJson(item: JSONObject) {
        addMessage(parseChatMessage(item))
    }

    fun sendMessage(
        text: String,
        alert: Boolean,
        destinatarioRol: String?,
        destinoTipo: String?,
        destinoId: String?,
        destinoLabel: String?
    ) {
        val operationId = host.getChatOperationId()
        if (operationId <= 0) {
            addMessage(
                ChatMessage(
                    user = "Sistema",
                    text = "No hay operacion activa para enviar mensajes.",
                    type = MessageType.SYSTEM
                )
            )
            return
        }

        repository.sendMessage(
            operationId = operationId,
            token = host.getChatToken(),
            contenido = text,
            tipoMensaje = if (alert) "URGENTE" else "NORMAL",
            destinatarioRol = destinatarioRol,
            destinoTipo = destinoTipo,
            destinoId = destinoId,
            destinoLabel = destinoLabel,
            onSuccess = { item -> addMessageFromJson(item) },
            onError = { message ->
                addMessage(ChatMessage(user = "Sistema", text = message, type = MessageType.SYSTEM))
            }
        )
    }

    fun sendAttachment(
        uri: Uri,
        fileName: String,
        mimeType: String,
        attachmentKind: String,
        destinatarioRol: String?,
        destinoTipo: String?,
        destinoId: String?,
        destinoLabel: String?,
        durationMs: Long? = null
    ) {
        val operationId = host.getChatOperationId()
        if (operationId <= 0) {
            addMessage(
                ChatMessage(
                    user = "Sistema",
                    text = "No hay operacion activa para enviar adjuntos.",
                    type = MessageType.SYSTEM
                )
            )
            return
        }

        repository.sendAttachment(
            operationId = operationId,
            token = host.getChatToken(),
            contentResolver = host.getChatContentResolver(),
            uri = uri,
            fileName = fileName,
            mimeType = mimeType,
            attachmentKind = attachmentKind,
            destinatarioRol = destinatarioRol,
            destinoTipo = destinoTipo,
            destinoId = destinoId,
            destinoLabel = destinoLabel,
            durationMs = durationMs,
            onSuccess = { item -> addMessageFromJson(item) },
            onError = { message ->
                addMessage(ChatMessage(user = "Sistema", text = message, type = MessageType.SYSTEM))
            }
        )
    }

    fun loadHistoryIfNeeded() {
        val operationId = host.getChatOperationId()
        if (chatLoaded || operationId <= 0) return

        repository.getMessages(
            operationId = operationId,
            token = host.getChatToken(),
            onSuccess = { items ->
                mainHandler.post {
                    messages.clear()

                    for (i in 0 until items.length()) {
                        val item = items.optJSONObject(i) ?: continue
                        messages.add(parseChatMessage(item))
                    }

                    chatLoaded = true
                    refreshVisibleMessages()
                    host.onChatVisibleMessagesRead(visibleMessages.toList())
                }
            },
            onError = { message ->
                Log.w("CHAT_HTTP", "No se pudo cargar historial de chat: $message")
            }
        )
    }

    fun refreshVisibleMessages(notify: Boolean = true) {
        visibleMessages.clear()
        visibleMessages.addAll(messages.filter { isVisibleInActiveChatFilter(it) })

        if (notify) {
            chatAdapter?.notifyDataSetChanged()
            if (visibleMessages.isNotEmpty()) {
                chatRecycler?.scrollToPosition(visibleMessages.size - 1)
            }
        }
        syncEmptyState()
    }

    private fun parseChatMessage(item: JSONObject): ChatMessage {
        val id = item.optInt("id_mensaje", -1).takeIf { it > 0 }
        val autor = item.optString("autor_nombre", "Sistema")
        val contenido = item.optString("contenido", "")
        val tipoMensaje = item.optString("tipo_mensaje", "NORMAL").uppercase()

        val messageType = when (tipoMensaje) {
            "URGENTE" -> MessageType.ALERT
            "SISTEMA" -> MessageType.SYSTEM
            else -> MessageType.NORMAL
        }

        val idPersonal = item.optInt("id_personal", -1).takeIf { it > 0 }
        val idUsuario = item.optInt("id_usuario", -1).takeIf { it > 0 }
        val currentUser = host.getChatCurrentUser()
        val isMine = (idPersonal != null && idPersonal == currentUser.id) ||
            (idUsuario != null && idUsuario == currentUser.id)

        return ChatMessage(
            id = id,
            idUsuario = idUsuario,
            idPersonal = idPersonal,
            user = autor,
            text = contenido,
            type = messageType,
            isMine = isMine,
            destinatarioRol = item.optString("destinatario_rol", "GLOBAL"),
            autorRol = item.optString("autor_rol", "").uppercase().ifBlank { null },
            destinoTipo = optionalJsonString(item, "destino_tipo"),
            destinoId = optionalJsonString(item, "destino_id"),
            destinoLabel = optionalJsonString(item, "destino_label"),
            attachmentKind = optionalJsonString(item, "attachment_kind"),
            attachmentUrl = optionalJsonString(item, "attachment_url"),
            attachmentMime = optionalJsonString(item, "attachment_mime"),
            attachmentName = optionalJsonString(item, "attachment_name"),
            attachmentSize = optionalJsonLong(item, "attachment_size"),
            attachmentDurationMs = optionalJsonLong(item, "attachment_duration_ms")
        )
    }

    private fun optionalJsonString(item: JSONObject, key: String): String? {
        if (!item.has(key) || item.isNull(key)) return null
        return item.optString(key, "").trim()
            .takeUnless { it.isBlank() || it.equals("null", ignoreCase = true) }
    }

    private fun optionalJsonLong(item: JSONObject, key: String): Long? {
        if (!item.has(key) || item.isNull(key)) return null
        return runCatching { item.getLong(key) }.getOrNull()
    }

    private fun isVisibleInActiveChatFilter(msg: ChatMessage): Boolean {
        if (msg.type == MessageType.SYSTEM) return true

        val selection = activeSelection
        val destinatario = msg.destinatarioRol.orEmpty().trim().uppercase().ifBlank { "GLOBAL" }
        val destinoTipo = msg.destinoTipo.orEmpty().trim().uppercase()
        val destinoId = msg.destinoId

        return when (selection.type.uppercase()) {
            "GLOBAL" -> destinatario == "GLOBAL" && (destinoTipo.isBlank() || destinoTipo == "GLOBAL")
            "CETS" -> (destinatario == "CET" && (destinoTipo.isBlank() || destinoTipo == "CETS")) ||
                destinoTipo == "CUTS"
            "CET_SPECIFIC" -> (destinoTipo == "CET" && sameChatValue(destinoId, selection.destinoId)) ||
                (destinoTipo == "CUT" && sameChatValue(msg.idPersonal?.toString(), selection.destinoId))
            "MY_CET" -> (destinoTipo == "CET" && sameChatValue(destinoId, selection.destinoId)) ||
                (
                    destinoTipo == "CELL" &&
                        sameChatValue(destinoId, host.getChatCurrentUser().id.toString()) &&
                        sameChatValue(msg.idPersonal?.toString(), selection.destinoId)
                )
            "CUTS" -> destinoTipo == "CUTS" || (destinatario == "CUT" && destinoTipo.isBlank())
            "CUT_SPECIFIC", "MY_CUT" -> (destinoTipo == "CUT" && sameChatValue(destinoId, selection.destinoId)) ||
                (destinoTipo == "CET" && sameChatValue(msg.idPersonal?.toString(), selection.destinoId))
            "CELL_SPECIFIC" -> destinoTipo == "CELL" && sameChatValue(destinoId, selection.destinoId)
            "FLOTILLA" -> isFlotillaMessageForSelection(msg, selection)
            "GRUPO" -> destinoTipo == "GRUPO" && matchesGroupSelection(msg, selection)
            "VEHICULO" -> destinoTipo == "CELL_LIST" &&
                sameCellList(destinoId, selection.destinoId)
            else -> destinatario == "GLOBAL" && destinoTipo.isBlank()
        }
    }

    private fun syncEmptyState() {
        chatEmptyState?.visibility = if (visibleMessages.isEmpty()) View.VISIBLE else View.GONE
    }

    private fun sameCellList(a: String?, b: String?): Boolean {
        val left = a.orEmpty().split(",").map(::normalizeChatValue).filter { it.isNotBlank() }.toSet()
        val right = b.orEmpty().split(",").map(::normalizeChatValue).filter { it.isNotBlank() }.toSet()
        return left.isNotEmpty() && left == right
    }

    private fun isFlotillaMessageForSelection(
        msg: ChatMessage,
        selection: ChatChannelSelection
    ): Boolean {
        return when (msg.destinoTipo.orEmpty().trim().uppercase()) {
            "FLOTILLA" -> matchesAnyChatAlias(
                listOf(msg.destinoId, msg.destinoLabel),
                flotillaAliasesForSelection(selection)
            )
            "CELL" -> cellBelongsToFlotilla(msg.destinoId, selection)
            else -> false
        }
    }

    private fun matchesGroupSelection(
        msg: ChatMessage,
        selection: ChatChannelSelection
    ): Boolean = matchesAnyChatAlias(
        listOf(msg.destinoId, msg.destinoLabel),
        groupAliasesForSelection(selection)
    )

    private fun cellBelongsToFlotilla(cellId: String?, selection: ChatChannelSelection): Boolean {
        val cell = host.getChatPersonal().firstOrNull {
            it.rol.equals("CELL", ignoreCase = true) &&
                sameChatValue(it.idPersonal.toString(), cellId)
        } ?: return false

        return matchesAnyChatAlias(personalFlotillaAliases(cell), flotillaAliasesForSelection(selection))
    }

    private fun flotillaAliasesForSelection(selection: ChatChannelSelection): Set<String> {
        val aliases = linkedSetOf<String>()
        aliases.addNormalized(selection.destinoId)
        aliases.addNormalized(selection.destinoLabel)

        host.getChatPersonal().forEach { person ->
            val personAliases = personalFlotillaAliases(person)
            if (matchesAnyChatAlias(personAliases, aliases)) {
                aliases.addNormalized(personAliases)
            }
        }

        return aliases
    }

    private fun groupAliasesForSelection(selection: ChatChannelSelection): Set<String> {
        val aliases = linkedSetOf<String>()
        aliases.addNormalized(selection.destinoId)
        aliases.addNormalized(selection.destinoLabel)
        selection.destinoLabel
            ?.substringBefore("(")
            ?.trim()
            ?.let { aliases.addNormalized(it) }

        host.getChatPersonal().forEach { person ->
            val personAliases = personalGroupAliases(person)
            if (matchesAnyChatAlias(personAliases, aliases)) {
                aliases.addNormalized(personAliases)
            }
        }

        return aliases
    }

    private fun personalFlotillaAliases(person: PersonalItem): List<String?> {
        val padre = person.grupoPadreNombre.trim()
        val padreApodo = person.grupoPadreApodo.trim()
        val grupo = person.grupoNombre.trim()
        val grupoApodo = person.grupoApodo.trim()
        val useParent = (padre.isNotBlank() || padreApodo.isNotBlank()) &&
            !isRootGroupName(padre) &&
            !isRootGroupName(padreApodo)

        return if (useParent) {
            listOf(
                person.idGrupoPadre?.toString(),
                padre,
                padreApodo,
                person.cetFlotilla
            )
        } else {
            listOf(
                person.idGrupoOperacion?.toString(),
                grupo,
                grupoApodo,
                person.cetFlotilla
            )
        }
    }

    private fun personalGroupAliases(person: PersonalItem): List<String?> {
        val grupo = person.grupoNombre.trim()
        val grupoApodo = person.grupoApodo.trim()
        val padre = person.grupoPadreNombre.trim()
        val padreApodo = person.grupoPadreApodo.trim()
        return listOf(
            person.idGrupoOperacion?.toString(),
            grupo,
            grupoApodo,
            if (grupo.isNotBlank() && padre.isNotBlank()) "$grupo ($padre)" else null,
            if (grupoApodo.isNotBlank() && padreApodo.isNotBlank()) "$grupoApodo ($padreApodo)" else null
        )
    }

    private fun isRootGroupName(value: String?): Boolean {
        val normalized = normalizeChatValue(value)
        return normalized.isBlank() ||
            normalized == "mando operativo" ||
            normalized == "sin flotilla" ||
            normalized == "root"
    }

    private fun matchesAnyChatAlias(values: Iterable<String?>, aliases: Iterable<String?>): Boolean {
        val normalizedAliases = aliases
            .map { normalizeChatValue(it) }
            .filter { it.isNotBlank() }
            .toSet()
        if (normalizedAliases.isEmpty()) return false
        return values.any { normalizeChatValue(it) in normalizedAliases }
    }

    private fun sameChatValue(a: String?, b: String?): Boolean {
        val left = normalizeChatValue(a)
        val right = normalizeChatValue(b)
        return left.isNotBlank() && left == right
    }

    private fun normalizeChatValue(value: String?): String =
        value.orEmpty().trim().lowercase()

    private fun MutableSet<String>.addNormalized(value: String?) {
        val normalized = value.orEmpty().trim()
        if (normalized.isNotBlank()) add(normalized)
    }

    private fun MutableSet<String>.addNormalized(values: Iterable<String?>) {
        values.forEach { addNormalized(it) }
    }
}
