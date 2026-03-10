package com.operaciones.operaciones_android

import android.content.Context

/**
 * AuthManager — persiste la sesión activa en SharedPreferences.
 * En producción almacenaría el JWT recibido del endpoint POST /auth/login.
 */
object AuthManager {

    private const val PREFS = "sedam_session"
    private const val KEY_USER_ID = "uid"
    private const val KEY_LOGGED_IN = "logged_in"

    fun saveSession(context: Context, user: User) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_LOGGED_IN, true)
            .putInt(KEY_USER_ID, user.id)
            .apply()
    }

    fun isLoggedIn(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_LOGGED_IN, false)

    fun getCurrentUser(context: Context): User? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_LOGGED_IN, false)) return null
        val id = prefs.getInt(KEY_USER_ID, -1)
        return MockData.users.find { it.id == id }
    }

    fun logout(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }
}