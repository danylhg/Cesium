package com.operaciones.operaciones_android

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

class LoginActivity : AppCompatActivity() {

    private lateinit var inputUsername: EditText
    private lateinit var inputPassword: EditText
    private lateinit var btnLogin: Button
    private lateinit var tvError: TextView
    private lateinit var progress: ProgressBar

    // Celular físico → IP local de tu PC (cámbiala por la que te da ipconfig)
    // Emulador       → usar "http://10.0.2.2:3001"
    private val BASE_URL = "http://192.168.202.103:3001"

    private val http = OkHttpClient()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Sesión activa → saltar login
        if (AuthManager.isLoggedIn(this)) {
            fetchOperacionYNavegar(AuthManager.getCurrentUser(this)!!)
            return
        }

        setContentView(R.layout.activity_login)

        inputUsername = findViewById(R.id.inputNumControl)   // mismo id del layout
        inputPassword = findViewById(R.id.inputPassword)
        btnLogin      = findViewById(R.id.btnLogin)
        tvError       = findViewById(R.id.tvError)
        progress      = findViewById(R.id.loginProgress)

        inputPassword.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) { attemptLogin(); true } else false
        }
        btnLogin.setOnClickListener { attemptLogin() }
    }

    // ── Paso 1: autenticar ────────────────────────────────────────────────────

    private fun attemptLogin() {
        val username = inputUsername.text.toString().trim()
        val password = inputPassword.text.toString()
        tvError.visibility = View.GONE

        if (username.isEmpty() || password.isEmpty()) {
            showError("Ingresa tu usuario y contraseña.")
            return
        }

        setLoading(true)

        val body = JSONObject().apply {
            put("username", username)
            put("password", password)
        }.toString().toRequestBody("application/json".toMediaType())

        val req = Request.Builder().url("$BASE_URL/auth/login").post(body).build()

        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                runOnUiThread {
                    setLoading(false)
                    showError("No se pudo conectar.\nVerifica que la API esté en $BASE_URL")
                }
            }
            override fun onResponse(call: Call, response: Response) {
                val bodyStr = response.body?.string() ?: ""
                runOnUiThread {
                    setLoading(false)
                    try {
                        val json = JSONObject(bodyStr)
                        when {
                            response.isSuccessful && json.optBoolean("ok") ->
                                handleLoginSuccess(json)
                            response.code == 403 ->
                                showError(json.optString("mensaje", "Usuario inactivo."))
                            else ->
                                showError(json.optString("mensaje", "Usuario o contraseña incorrectos."))
                        }
                    } catch (_: Exception) {
                        showError("Error al procesar la respuesta.")
                    }
                }
            }
        })
    }

    private fun handleLoginSuccess(json: JSONObject) {
        val token = json.getString("token")
        val u     = json.getJSONObject("usuario")

        val rolStr = u.getString("rol").uppercase()
        val rol = try { UserRole.valueOf(rolStr) } catch (_: Exception) { UserRole.CELL }

        // Solo CET y CELL usan la app móvil
        if (rol == UserRole.ADMIN || rol == UserRole.CUT) {
            showError("Este rol solo tiene acceso a la plataforma web.")
            return
        }

        val user = User(
            id        = u.getInt("id_usuario"),
            nombre    = u.optString("nombre",   ""),
            apellido  = u.optString("apellido", ""),
            username  = u.getString("username"),
            rol       = rol,
            jerarquia = u.optString("puesto",   ""),
            tabla     = u.optString("tabla",    "personal")
        )

        AuthManager.saveSession(this, user, token)
        fetchOperacionYNavegar(user)
    }

    // ── Paso 2: consultar operación asignada al servidor ──────────────────────

    private fun fetchOperacionYNavegar(user: User) {
        setLoading(true)

        val token = AuthManager.getToken(this)

        // GET /ops/personal/:id_personal — operación activa del personal
        // Si el endpoint no existe aún, cae al fallback con MockData
        val req = Request.Builder()
            .url("$BASE_URL/ops/personal/${user.id}")
            .get()
            .addHeader("Authorization", "Bearer $token")
            .build()

        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                // Sin conexión → usar MockData como fallback
                runOnUiThread {
                    setLoading(false)
                    navegarConMock(user)
                }
            }
            override fun onResponse(call: Call, response: Response) {
                val bodyStr = response.body?.string() ?: ""
                runOnUiThread {
                    setLoading(false)
                    try {
                        if (response.isSuccessful) {
                            val json = JSONObject(bodyStr)
                            val opJson = json.optJSONObject("operacion")
                            if (opJson != null) {
                                navegarConOperacion(user, parseOperacion(opJson))
                            } else {
                                // Sin operación asignada → pantalla de espera
                                navegarSinOperacion(user)
                            }
                        } else {
                            // 404 = sin operación, otro error = fallback mock
                            if (response.code == 404) navegarSinOperacion(user)
                            else navegarConMock(user)
                        }
                    } catch (_: Exception) {
                        navegarConMock(user)
                    }
                }
            }
        })
    }

    private fun parseOperacion(o: JSONObject): Operation {
        val estadoStr = o.optString("estado", "PLANIFICADA").uppercase()
        val status = try { OperationStatus.valueOf(estadoStr) }
        catch (_: Exception) { OperationStatus.PLANIFICADA }
        return Operation(
            id          = o.getInt("id_operacion"),
            codigo      = o.optString("codigo",      ""),
            nombre      = o.optString("nombre",      "Sin nombre"),
            descripcion = o.optString("descripcion", ""),
            prioridad   = o.optString("prioridad",   "MEDIA"),
            status      = status,
            fechaInicio = o.optString("fecha_inicio", ""),
            fechaFin    = o.optString("fecha_fin",    "")
        )
    }

    // ── Navegación ────────────────────────────────────────────────────────────

    private fun navegarConOperacion(user: User, op: Operation) {
        val intent = when (op.status) {
            OperationStatus.ACTIVA ->
                Intent(this, MainActivity::class.java)
            else ->
                Intent(this, OperationStatusActivity::class.java)
        }
        intent.putExtra("USER_ID",      user.id)
        intent.putExtra("OPERATION_ID", op.id)
        startActivity(intent)
        finish()
    }

    private fun navegarSinOperacion(user: User) {
        val intent = Intent(this, OperationStatusActivity::class.java)
        intent.putExtra("USER_ID",      user.id)
        intent.putExtra("OPERATION_ID", -1)
        startActivity(intent)
        finish()
    }

    /** Fallback mientras el endpoint /ops/personal/:id no exista en el servidor */
    private fun navegarConMock(user: User) {
        val op = MockData.getOperationForUser(user.id)
        val intent = when {
            op?.status == OperationStatus.ACTIVA ->
                Intent(this, MainActivity::class.java)
            else ->
                Intent(this, OperationStatusActivity::class.java)
        }
        intent.putExtra("USER_ID",      user.id)
        intent.putExtra("OPERATION_ID", op?.id ?: -1)
        startActivity(intent)
        finish()
    }

    // ── UI helpers ────────────────────────────────────────────────────────────

    private fun showError(msg: String) {
        tvError.text = msg
        tvError.visibility = View.VISIBLE
        inputPassword.animate().translationX(10f).setDuration(50).withEndAction {
            inputPassword.animate().translationX(-10f).setDuration(50).withEndAction {
                inputPassword.animate().translationX(0f).setDuration(50).start()
            }.start()
        }.start()
    }

    private fun setLoading(loading: Boolean) {
        progress.visibility = if (loading) View.VISIBLE else View.GONE
        btnLogin.isEnabled  = !loading
        btnLogin.alpha      = if (loading) 0.6f else 1f
    }
}