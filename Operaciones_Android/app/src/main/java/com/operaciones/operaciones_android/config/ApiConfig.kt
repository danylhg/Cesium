package com.operaciones.operaciones_android.config

import android.content.Context
import android.net.Uri

object ApiConfig {
    private const val PREFS = "sedam_api_config"
    private const val KEY_BASE_URL = "base_url"
    private const val KEY_RTMP_PUBLISH_BASE_URL = "rtmp_publish_base_url"
    private const val KEY_HLS_PLAYBACK_BASE_URL = "hls_playback_base_url"
    private const val DEFAULT_API_PORT = 3001
    private const val DEFAULT_HLS_PORT = 3000
    private const val DEFAULT_FFMPEG_HLS_PATH = "/Operaciones/runtime/ffmpeg-streams"

    const val DEFAULT_BASE_URL = "http://192.168.202.103:3001"

    var BASE_URL: String = DEFAULT_BASE_URL
        private set
    var RTMP_PUBLISH_BASE_URL: String = defaultRtmpPublishBaseUrl(DEFAULT_BASE_URL)
        private set
    var HLS_PLAYBACK_BASE_URL: String = defaultHlsPlaybackBaseUrl(DEFAULT_BASE_URL)
        private set

    data class ServerUrls(
        val apiBaseUrl: String,
        val rtmpPublishBaseUrl: String,
        val hlsPlaybackBaseUrl: String
    )

    fun load(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val savedUrl = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL)
            ?: DEFAULT_BASE_URL

        BASE_URL = normalizeBaseUrl(savedUrl)
        RTMP_PUBLISH_BASE_URL = normalizeRtmpPublishBaseUrl(
            prefs.getString(KEY_RTMP_PUBLISH_BASE_URL, null).orEmpty(),
            BASE_URL
        )
        HLS_PLAYBACK_BASE_URL = normalizeHlsPlaybackBaseUrl(
            prefs.getString(KEY_HLS_PLAYBACK_BASE_URL, null).orEmpty(),
            BASE_URL
        )
        return BASE_URL
    }

    fun saveBaseUrl(context: Context, rawUrl: String): String {
        return saveServerUrls(context, rawUrl, "", "").apiBaseUrl
    }

    fun saveServerUrls(
        context: Context,
        rawApiUrl: String,
        rawRtmpPublishBaseUrl: String,
        rawHlsPlaybackBaseUrl: String
    ): ServerUrls {
        val normalizedApiUrl = normalizeBaseUrl(rawApiUrl)
        val normalizedRtmpUrl = normalizeRtmpPublishBaseUrl(rawRtmpPublishBaseUrl, normalizedApiUrl)
        val normalizedHlsUrl = normalizeHlsPlaybackBaseUrl(rawHlsPlaybackBaseUrl, normalizedApiUrl)

        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_BASE_URL, normalizedApiUrl)
            .putString(KEY_RTMP_PUBLISH_BASE_URL, normalizedRtmpUrl)
            .putString(KEY_HLS_PLAYBACK_BASE_URL, normalizedHlsUrl)
            .apply()

        BASE_URL = normalizedApiUrl
        RTMP_PUBLISH_BASE_URL = normalizedRtmpUrl
        HLS_PLAYBACK_BASE_URL = normalizedHlsUrl

        return ServerUrls(normalizedApiUrl, normalizedRtmpUrl, normalizedHlsUrl)
    }

    fun normalizeBaseUrl(rawUrl: String): String {
        var value = rawUrl.trim().trimEnd('/')
        require(value.isNotBlank()) { "Ingresa la direccion del servidor." }

        if (!value.startsWith("http://", ignoreCase = true) &&
            !value.startsWith("https://", ignoreCase = true)
        ) {
            value = "http://$value"
        }

        val uri = Uri.parse(value)
        val scheme = uri.scheme?.lowercase()
        val hasSupportedScheme = scheme == "http" || scheme == "https"
        require(hasSupportedScheme && !uri.host.isNullOrBlank()) {
            "Direccion invalida. Usa una IP o URL valida."
        }

        val path = uri.encodedPath.orEmpty()
        if (uri.port == -1 && shouldAppendDefaultApiPort(uri) && (path.isBlank() || path == "/")) {
            value = "$value:$DEFAULT_API_PORT"
        }

        return value.trimEnd('/')
    }

    private fun shouldAppendDefaultApiPort(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase()
        return scheme == "http"
    }

    fun defaultRtmpPublishBaseUrl(apiBaseUrl: String = BASE_URL): String {
        val uri = Uri.parse(normalizeBaseUrl(apiBaseUrl))
        val host = uri.host ?: Uri.parse(DEFAULT_BASE_URL).host.orEmpty()
        return "rtmp://$host/live"
    }

    fun defaultHlsPlaybackBaseUrl(apiBaseUrl: String = BASE_URL): String {
        val uri = Uri.parse(normalizeBaseUrl(apiBaseUrl))
        val host = uri.host ?: Uri.parse(DEFAULT_BASE_URL).host.orEmpty()
        return "http://$host:$DEFAULT_HLS_PORT$DEFAULT_FFMPEG_HLS_PATH"
    }

    fun normalizeRtmpPublishBaseUrl(rawUrl: String, apiBaseUrl: String = BASE_URL): String {
        var value = rawUrl.trim().trimEnd('/')
        if (value.isBlank()) return defaultRtmpPublishBaseUrl(apiBaseUrl)

        if (!value.startsWith("rtmp://", ignoreCase = true) &&
            !value.startsWith("rtmps://", ignoreCase = true)
        ) {
            value = "rtmp://$value"
        }

        val uri = Uri.parse(value)
        val scheme = uri.scheme?.lowercase()
        require((scheme == "rtmp" || scheme == "rtmps") && !uri.host.isNullOrBlank()) {
            "Direccion RTMP invalida. Usa rtmp://IP/live."
        }

        val path = uri.encodedPath.orEmpty()
        if (path.isBlank() || path == "/") value = "$value/live"

        return value.trimEnd('/')
    }

    fun normalizeHlsPlaybackBaseUrl(rawUrl: String, apiBaseUrl: String = BASE_URL): String {
        var value = rawUrl.trim().trimEnd('/')
        if (value.isBlank()) return defaultHlsPlaybackBaseUrl(apiBaseUrl)

        if (!value.startsWith("http://", ignoreCase = true) &&
            !value.startsWith("https://", ignoreCase = true)
        ) {
            value = "http://$value"
        }

        val uri = Uri.parse(value)
        val scheme = uri.scheme?.lowercase()
        require((scheme == "http" || scheme == "https") && !uri.host.isNullOrBlank()) {
            "Direccion HLS invalida. Usa http://IP:3000/Operaciones/runtime/ffmpeg-streams."
        }

        val path = uri.encodedPath.orEmpty()
        if (uri.port == -1 && (path.isBlank() || path == "/")) {
            value = "$value:$DEFAULT_HLS_PORT$DEFAULT_FFMPEG_HLS_PATH"
        } else if (path.isBlank() || path == "/") {
            value = "$value$DEFAULT_FFMPEG_HLS_PATH"
        }

        return value.trimEnd('/')
    }
}
