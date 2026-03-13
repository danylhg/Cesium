package com.operaciones.operaciones_android.ui
import com.operaciones.operaciones_android.config.ApiConfig
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
import com.operaciones.operaciones_android.auth.AuthManager
import com.operaciones.operaciones_android.model.Operation
import com.operaciones.operaciones_android.model.OperationStatus
import com.operaciones.operaciones_android.model.User
import com.operaciones.operaciones_android.model.UserRole
import com.operaciones.operaciones_android.R

class LoginActivity : AppCompatActivity() {

    private lateinit var inputUsername: EditText
    private lateinit var inputPassword: EditText
    private lateinit var btnLogin: Button
    private lateinit var tvError: TextView
    private lateinit var progress: ProgressBar

    // IP del servidor — cambiar por la IP local de tu máquina (ipconfig/ifconfig)
    private val BASE_URL = ApiConfig.BASE_URL

    private val http = OkHttpClient()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        inputUsername = findViewById(R.id.inputNumControl)
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

        val tabla = u.optString("tabla", "personal")
        val id = if (tabla == "personal")
            u.optInt("id_personal", 0).takeIf { it > 0 } ?: u.optInt("id_usuario", 0)
        else
            u.optInt("id_usuario", 0)

        val user = User(
            id        = id,
            nombre    = u.optString("nombre",   ""),
            apellido  = u.optString("apellido", ""),
            username  = u.getString("username"),
            rol       = rol,
            jerarquia = u.optString("puesto",   ""),
            tabla     = tabla
        )

        AuthManager.saveSession(this, user, token)
        fetchOperacionYNavegar(user)
    }

    // ── Paso 2: consultar operación asignada ──────────────────────────────────

    private fun fetchOperacionYNavegar(user: User) {
        setLoading(true)

        val req = Request.Builder()
            .url("$BASE_URL/ops/personal/${user.id}")
            .get()
            .addHeader("Authorization", "Bearer ${AuthManager.getToken(this)}")
            .build()

        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                runOnUiThread {
                    setLoading(false)
                    showError("No se pudo obtener la operación asignada.\nVerifica tu conexión.")
                }
            }
            override fun onResponse(call: Call, response: Response) {
                val bodyStr = response.body?.string() ?: ""
                runOnUiThread {
                    setLoading(false)
                    try {
                        when {
                            response.isSuccessful -> {
                                val json   = JSONObject(bodyStr)
                                val opJson = json.optJSONObject("operacion")
                                if (opJson != null) navegarConOperacion(user, parseOperacion(opJson))
                                else                navegarSinOperacion(user)
                            }
                            response.code == 404 -> navegarSinOperacion(user)
                            else -> showError("Error del servidor (${response.code}).\nIntenta de nuevo.")
                        }
                    } catch (_: Exception) {
                        showError("Error al procesar la respuesta del servidor.")
                    }
                }
            }
        })
    }

    private fun parseOperacion(o: JSONObject): Operation {
        val estadoStr = o.optString("estado", "PLANIFICADA").uppercase()
        val status = try { OperationStatus.valueOf(estadoStr) }
        catch (_: Exception) { OperationStatus.PLANIFICADA }
        val zona = o.optJSONObject("zona")

        return Operation(
            id          = o.getInt("id_operacion"),
            codigo      = o.optString("codigo",      ""),
            nombre      = o.optString("nombre",      "Sin nombre"),
            descripcion = o.optString("descripcion", ""),
            prioridad   = o.optString("prioridad",   "MEDIA"),
            status      = status,
            fechaInicio = o.optString("fecha_inicio", ""),
            fechaFin    = o.optString("fecha_fin",    ""),
            zonaLat     = zona?.optDouble("centroide_lat", 0.0) ?: 0.0,
            zonaLon     = zona?.optDouble("centroide_lon", 0.0) ?: 0.0,
            zonaZoom    = zona?.optInt("zoom_inicial",  8000)   ?: 8000
        )
    }

    // ── Navegación ────────────────────────────────────────────────────────────

    private fun navegarConOperacion(user: User, op: Operation) {
        val intent = when (op.status) {
            OperationStatus.ACTIVA -> Intent(this, MainActivity::class.java)
            else                   -> Intent(this, OperationStatusActivity::class.java)
        }

        intent.putExtra("USER_ID",        user.id)
        intent.putExtra("OPERATION_ID",   op.id)
        intent.putExtra("OP_ESTADO",      op.status.name)   // necesario para OperationStatusActivity
        intent.putExtra("OP_CODIGO",      op.codigo)
        intent.putExtra("OP_NOMBRE",      op.nombre)
        intent.putExtra("OP_DESCRIPCION", op.descripcion)
        intent.putExtra("OP_PRIORIDAD",   op.prioridad)
        intent.putExtra("OP_FECHA_INICIO", op.fechaInicio)
        intent.putExtra("OP_FECHA_FIN",    op.fechaFin)
        intent.putExtra("OP_LAT",          op.zonaLat)
        intent.putExtra("OP_LON",          op.zonaLon)
        intent.putExtra("OP_ZOOM",         op.zonaZoom)

        startActivity(intent)
        finish()
    }

    private fun navegarSinOperacion(user: User) {
        startActivity(
            Intent(this, OperationStatusActivity::class.java).apply {
                putExtra("USER_ID",      user.id)
                putExtra("OPERATION_ID", -1)
            }
        )
        finish()
    }

    // ── UI helpers ────────────────────────────────────────────────────────────

    private fun showError(msg: String) {
        tvError.text       = msg
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