package com.operaciones.operaciones_android.config

import android.content.Context
import android.net.Uri

object ApiConfig {
    private const val PREFS = "sedam_api_config"
    private const val KEY_BASE_URL = "base_url"
    private const val DEFAULT_API_PORT = 3001

    const val DEFAULT_BASE_URL = "http://192.168.202.103:3001"

    var BASE_URL: String = DEFAULT_BASE_URL
        private set

    fun load(context: Context): String {
        val savedUrl = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_BASE_URL, DEFAULT_BASE_URL)
            ?: DEFAULT_BASE_URL

        BASE_URL = normalizeBaseUrl(savedUrl)
        return BASE_URL
    }

    fun saveBaseUrl(context: Context, rawUrl: String): String {
        val normalizedUrl = normalizeBaseUrl(rawUrl)

        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_BASE_URL, normalizedUrl)
            .apply()

        BASE_URL = normalizedUrl
        return BASE_URL
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
        if (uri.port == -1 && (path.isBlank() || path == "/")) {
            value = "$value:$DEFAULT_API_PORT"
        }

        return value.trimEnd('/')
    }
}
