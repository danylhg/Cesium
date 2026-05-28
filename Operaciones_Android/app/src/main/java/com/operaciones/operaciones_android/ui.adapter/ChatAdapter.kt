package com.operaciones.operaciones_android.ui.adapter

import android.content.Intent
import android.graphics.BitmapFactory
import android.graphics.Color
import android.media.MediaPlayer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.MediaController
import android.widget.TextView
import android.widget.VideoView
import androidx.recyclerview.widget.RecyclerView
import com.operaciones.operaciones_android.R
import com.operaciones.operaciones_android.auth.AuthManager
import com.operaciones.operaciones_android.config.ApiConfig
import com.operaciones.operaciones_android.model.ChatMessage
import com.operaciones.operaciones_android.model.MessageType
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import kotlin.math.abs

class ChatAdapter(private val messages: List<ChatMessage>)
    : RecyclerView.Adapter<ChatAdapter.ViewHolder>() {

    companion object {
        private const val LEGACY_ATTACHMENT_PREFIX = "CHAT_ATTACHMENT:"
        private val COLOR_META_DEFAULT = Color.parseColor("#4a6580")
        private val COLOR_META_ADMIN = Color.parseColor("#4ade80")
        private val COLOR_META_CUT = Color.parseColor("#86efac")
        private val COLOR_META_CET = Color.parseColor("#7ecfc2")
        private val COLOR_META_ALERT = Color.parseColor("#9b5555")
        private val COLOR_TEXT_NORMAL = Color.parseColor("#e2e8f0")
        private val COLOR_TEXT_ALERT = Color.parseColor("#fca5a5")
        private val COLOR_TEXT_SYSTEM = Color.parseColor("#94a3b8")
        private val mainHandler = Handler(Looper.getMainLooper())
        private var activeAudioPlayer: MediaPlayer? = null
        private var activeAudioUrl: String? = null
        private val attachmentHttp = OkHttpClient()
    }

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val bubble: LinearLayout = view.findViewById(R.id.bubble)
        val meta: TextView = view.findViewById(R.id.msgMeta)
        val text: TextView = view.findViewById(R.id.msgText)
        val imageAttachment: ImageView = view.findViewById(R.id.msgImageAttachment)
        val videoAttachment: VideoView = view.findViewById(R.id.msgVideoAttachment)
        val audioAttachment: TextView = view.findViewById(R.id.msgAudioAttachment)
        val attachment: TextView = view.findViewById(R.id.msgAttachment)
    }

    private data class LegacyAttachment(
        val kind: String,
        val dataUrl: String,
        val name: String?,
        val caption: String?
    )

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
                holder.text.text = displayText(msg)
                holder.text.setTextColor(COLOR_TEXT_SYSTEM)
                holder.text.textSize = 11f
                holder.text.gravity = Gravity.CENTER
                bindAttachment(holder, msg)
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
                holder.text.text = displayText(msg)
                holder.text.setTextColor(COLOR_TEXT_ALERT)
                holder.text.textSize = 13f
                holder.text.gravity = Gravity.START
                bindAttachment(holder, msg)
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
                holder.text.text = displayText(msg)
                holder.text.setTextColor(COLOR_TEXT_NORMAL)
                holder.text.textSize = 13f
                holder.text.gravity = Gravity.START
                bindAttachment(holder, msg)
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

    override fun onViewRecycled(holder: ViewHolder) {
        super.onViewRecycled(holder)
        holder.videoAttachment.stopPlayback()
        holder.videoAttachment.setMediaController(null)
        holder.imageAttachment.setImageDrawable(null)
    }

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

    private fun bindAttachment(holder: ViewHolder, msg: ChatMessage) {
        resetAttachmentViews(holder)

        val url = msg.attachmentUrl?.takeIf { it.isNotBlank() }
        if (url == null) {
            bindLegacyAttachment(holder, legacyAttachment(msg))
            return
        }

        val fullUrl = absoluteAttachmentUrl(url)
        when (attachmentKind(msg)) {
            "IMAGE" -> bindImageAttachment(holder, fullUrl)
            "VIDEO" -> bindVideoAttachment(holder, fullUrl)
            "AUDIO" -> bindAudioAttachment(holder, fullUrl, msg)
            else -> bindFileAttachment(holder, fullUrl, msg)
        }
    }

    private fun resetAttachmentViews(holder: ViewHolder) {
        holder.imageAttachment.visibility = View.GONE
        holder.imageAttachment.setImageDrawable(null)
        holder.imageAttachment.tag = null
        holder.imageAttachment.setOnClickListener(null)

        holder.videoAttachment.stopPlayback()
        holder.videoAttachment.setMediaController(null)
        holder.videoAttachment.visibility = View.GONE

        holder.audioAttachment.visibility = View.GONE
        holder.audioAttachment.text = ""
        holder.audioAttachment.tag = null
        holder.audioAttachment.setOnClickListener(null)

        holder.attachment.visibility = View.GONE
        holder.attachment.setOnClickListener(null)
    }

    private fun absoluteAttachmentUrl(url: String): String {
        if (url.startsWith("http://") || url.startsWith("https://")) {
            val parsed = Uri.parse(url)
            if (parsed.path?.startsWith("/api/storage/") == true) {
                return Uri.parse(ApiConfig.BASE_URL)
                    .buildUpon()
                    .encodedPath(parsed.encodedPath)
                    .encodedQuery(parsed.encodedQuery)
                    .fragment(parsed.fragment)
                    .build()
                    .toString()
            }
            return url
        }
        return "${ApiConfig.BASE_URL}${if (url.startsWith("/")) "" else "/"}$url"
    }

    private fun legacyAttachment(msg: ChatMessage): LegacyAttachment? {
        val text = msg.text.trim()
        if (!text.startsWith(LEGACY_ATTACHMENT_PREFIX)) return null
        return runCatching {
            val json = JSONObject(text.removePrefix(LEGACY_ATTACHMENT_PREFIX))
            LegacyAttachment(
                kind = json.optString("kind", ""),
                dataUrl = json.optString("dataUrl", ""),
                name = json.optString("name", "").takeIf { it.isNotBlank() },
                caption = json.optString("caption", "").takeIf { it.isNotBlank() }
            )
        }.getOrNull()?.takeIf { it.dataUrl.isNotBlank() }
    }

    private fun displayText(msg: ChatMessage): String {
        val legacy = legacyAttachment(msg) ?: return msg.text
        return legacy.caption?.takeIf { it.isNotBlank() } ?: legacyLabel(legacy)
    }

    private fun bindLegacyAttachment(holder: ViewHolder, legacy: LegacyAttachment?) {
        if (legacy == null) return
        when (legacyKind(legacy)) {
            "IMAGE" -> bindDataImageAttachment(holder, legacy.dataUrl)
            else -> {
                holder.attachment.visibility = View.VISIBLE
                holder.attachment.text = legacyLabel(legacy)
            }
        }
    }

    private fun legacyKind(legacy: LegacyAttachment): String {
        val kind = legacy.kind.trim().uppercase()
        if (kind in setOf("IMAGE", "VIDEO", "AUDIO", "FILE")) return kind
        val dataUrl = legacy.dataUrl.lowercase()
        return when {
            dataUrl.startsWith("data:image/") -> "IMAGE"
            dataUrl.startsWith("data:video/") -> "VIDEO"
            dataUrl.startsWith("data:audio/") -> "AUDIO"
            else -> "FILE"
        }
    }

    private fun legacyLabel(legacy: LegacyAttachment): String {
        val name = legacy.name?.takeIf { it.isNotBlank() }
        return when (legacyKind(legacy)) {
            "IMAGE" -> name?.let { "Imagen: $it" } ?: "Imagen adjunta"
            "VIDEO" -> name?.let { "Video: $it" } ?: "Video adjunto"
            "AUDIO" -> name?.let { "Audio: $it" } ?: "Audio adjunto"
            else -> name?.let { "Archivo: $it" } ?: "Archivo adjunto"
        }
    }

    private fun bindDataImageAttachment(holder: ViewHolder, dataUrl: String) {
        holder.imageAttachment.visibility = View.VISIBLE
        holder.imageAttachment.tag = dataUrl
        holder.imageAttachment.setBackgroundColor(Color.parseColor("#0f172a"))

        Thread {
            val bitmap = decodeDataImage(dataUrl)
            mainHandler.post {
                if (holder.imageAttachment.tag == dataUrl && bitmap != null) {
                    holder.imageAttachment.setImageBitmap(bitmap)
                }
            }
        }.start()
    }

    private fun decodeDataImage(dataUrl: String) = runCatching {
        val comma = dataUrl.indexOf(',')
        if (comma == -1) return@runCatching null
        val bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }.getOrNull()

    private fun attachmentKind(msg: ChatMessage): String {
        val kind = msg.attachmentKind?.uppercase().orEmpty()
        if (kind in setOf("IMAGE", "VIDEO", "AUDIO")) return kind
        val mime = msg.attachmentMime.orEmpty().lowercase()
        return when {
            mime.startsWith("image/") -> "IMAGE"
            mime.startsWith("video/") -> "VIDEO"
            mime.startsWith("audio/") -> "AUDIO"
            else -> "FILE"
        }
    }

    private fun bindImageAttachment(holder: ViewHolder, fullUrl: String) {
        val context = holder.itemView.context.applicationContext
        holder.imageAttachment.visibility = View.VISIBLE
        holder.imageAttachment.tag = fullUrl
        holder.imageAttachment.setBackgroundColor(Color.parseColor("#0f172a"))
        holder.imageAttachment.setOnClickListener { openExternal(holder, fullUrl) }

        Thread {
            val bitmap = runCatching {
                val token = AuthManager.getToken(context)
                val request = Request.Builder()
                    .url(fullUrl)
                    .apply {
                        if (token.isNotBlank()) addHeader("Authorization", "Bearer $token")
                    }
                    .build()

                attachmentHttp.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@runCatching null
                    response.body?.byteStream()?.use { BitmapFactory.decodeStream(it) }
                }
            }.getOrNull()

            mainHandler.post {
                if (holder.imageAttachment.tag == fullUrl && bitmap != null) {
                    holder.imageAttachment.setImageBitmap(bitmap)
                }
            }
        }.start()
    }

    private fun bindVideoAttachment(holder: ViewHolder, fullUrl: String) {
        val context = holder.itemView.context.applicationContext
        val controller = MediaController(context)
        holder.videoAttachment.visibility = View.VISIBLE
        holder.videoAttachment.tag = fullUrl
        holder.videoAttachment.setMediaController(controller)
        controller.setAnchorView(holder.videoAttachment)
        holder.attachment.visibility = View.VISIBLE
        holder.attachment.text = "Cargando video..."
        holder.attachment.setOnClickListener(null)

        Thread {
            val cachedFile = runCatching {
                val token = AuthManager.getToken(context)
                val request = Request.Builder()
                    .url(fullUrl)
                    .apply {
                        if (token.isNotBlank()) addHeader("Authorization", "Bearer $token")
                    }
                    .build()

                attachmentHttp.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@runCatching null
                    val extension = videoExtension(fullUrl, response.header("Content-Type").orEmpty())
                    val file = File(context.cacheDir, "chat_video_${abs(fullUrl.hashCode())}$extension")
                    response.body?.byteStream()?.use { input ->
                        FileOutputStream(file).use { output ->
                            input.copyTo(output)
                        }
                    } ?: return@runCatching null
                    file
                }
            }.getOrNull()

            mainHandler.post {
                if (holder.videoAttachment.tag != fullUrl) return@post

                if (cachedFile == null || !cachedFile.exists()) {
                    holder.attachment.text = "Abrir video"
                    holder.attachment.setOnClickListener { openExternal(holder, fullUrl) }
                    return@post
                }

                holder.videoAttachment.setVideoURI(Uri.fromFile(cachedFile))
                holder.videoAttachment.setOnPreparedListener {
                    holder.videoAttachment.seekTo(1)
                    holder.attachment.text = "Reproducir video"
                    holder.attachment.setOnClickListener {
                        holder.videoAttachment.start()
                    }
                }
                holder.videoAttachment.setOnErrorListener { _, _, _ ->
                    holder.videoAttachment.visibility = View.GONE
                    holder.attachment.text = "Abrir video"
                    holder.attachment.setOnClickListener { openExternal(holder, fullUrl) }
                    true
                }
                holder.videoAttachment.requestFocus()
            }
        }
    }

    private fun videoExtension(url: String, contentType: String): String {
        val path = Uri.parse(url).path.orEmpty().lowercase()
        return when {
            path.endsWith(".mp4") || contentType.contains("mp4", ignoreCase = true) -> ".mp4"
            path.endsWith(".webm") || contentType.contains("webm", ignoreCase = true) -> ".webm"
            path.endsWith(".3gp") || contentType.contains("3gpp", ignoreCase = true) -> ".3gp"
            else -> ".mp4"
        }
    }

    private fun bindAudioAttachment(holder: ViewHolder, fullUrl: String, msg: ChatMessage) {
        holder.audioAttachment.visibility = View.VISIBLE
        holder.audioAttachment.tag = fullUrl
        holder.audioAttachment.text = attachmentLabel(msg)
        holder.audioAttachment.setOnClickListener {
            toggleAudioPlayback(holder, fullUrl, msg)
        }
    }

    private fun toggleAudioPlayback(holder: ViewHolder, fullUrl: String, msg: ChatMessage) {
        if (activeAudioUrl == fullUrl && activeAudioPlayer?.isPlaying == true) {
            activeAudioPlayer?.stop()
            activeAudioPlayer?.release()
            activeAudioPlayer = null
            activeAudioUrl = null
            holder.audioAttachment.text = attachmentLabel(msg)
            return
        }

        activeAudioPlayer?.release()
        activeAudioPlayer = null
        activeAudioUrl = fullUrl
        holder.audioAttachment.text = "Cargando audio..."

        val player = MediaPlayer()
        activeAudioPlayer = player
        player.setOnPreparedListener {
            it.start()
            if (holder.audioAttachment.tag == fullUrl) holder.audioAttachment.text = "Reproduciendo audio"
        }
        player.setOnCompletionListener {
            it.release()
            if (activeAudioPlayer === it) {
                activeAudioPlayer = null
                activeAudioUrl = null
            }
            if (holder.audioAttachment.tag == fullUrl) holder.audioAttachment.text = attachmentLabel(msg)
        }
        player.setOnErrorListener { mediaPlayer, _, _ ->
            mediaPlayer.release()
            if (activeAudioPlayer === mediaPlayer) {
                activeAudioPlayer = null
                activeAudioUrl = null
            }
            if (holder.audioAttachment.tag == fullUrl) holder.audioAttachment.text = "No se pudo reproducir audio"
            true
        }
        runCatching {
            player.setDataSource(fullUrl)
            player.prepareAsync()
        }.onFailure {
            player.release()
            if (activeAudioPlayer === player) {
                activeAudioPlayer = null
                activeAudioUrl = null
            }
            holder.audioAttachment.text = "No se pudo reproducir audio"
        }
    }

    private fun bindFileAttachment(holder: ViewHolder, fullUrl: String, msg: ChatMessage) {
        holder.attachment.visibility = View.VISIBLE
        holder.attachment.text = attachmentLabel(msg)
        holder.attachment.setOnClickListener { openExternal(holder, fullUrl) }
    }

    private fun openExternal(holder: ViewHolder, fullUrl: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(fullUrl)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        holder.itemView.context.startActivity(intent)
    }

    private fun attachmentLabel(msg: ChatMessage): String {
        val name = msg.attachmentName?.takeIf { it.isNotBlank() }
        return when (attachmentKind(msg)) {
            "IMAGE" -> name?.let { "Imagen: $it" } ?: "Imagen adjunta"
            "VIDEO" -> name?.let { "Video: $it" } ?: "Video adjunto"
            "AUDIO" -> name?.let { "Audio: $it" } ?: "Reproducir audio"
            else -> name?.let { "Archivo: $it" } ?: "Abrir archivo"
        }
    }
}
