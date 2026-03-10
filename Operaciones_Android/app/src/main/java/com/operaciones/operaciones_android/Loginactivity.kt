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

class LoginActivity : AppCompatActivity() {

    private lateinit var inputNumControl: EditText
    private lateinit var inputPassword: EditText
    private lateinit var btnLogin: Button
    private lateinit var tvError: TextView
    private lateinit var progress: ProgressBar

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Si ya hay sesión activa, ir directo
        if (AuthManager.isLoggedIn(this)) {
            navigateAfterLogin(AuthManager.getCurrentUser(this)!!)
            return
        }

        setContentView(R.layout.activity_login)

        inputNumControl = findViewById(R.id.inputNumControl)
        inputPassword   = findViewById(R.id.inputPassword)
        btnLogin        = findViewById(R.id.btnLogin)
        tvError         = findViewById(R.id.tvError)
        progress        = findViewById(R.id.loginProgress)

        // Login al presionar "Done" en el teclado
        inputPassword.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) { attemptLogin(); true }
            else false
        }

        btnLogin.setOnClickListener { attemptLogin() }
    }

    private fun attemptLogin() {
        val numControl = inputNumControl.text.toString().trim()
        val password   = inputPassword.text.toString()

        tvError.visibility = View.GONE

        if (numControl.isEmpty() || password.isEmpty()) {
            showError("Ingresa tu número de control y contraseña.")
            return
        }

        // Simula latencia de red (en producción: llamada HTTP al backend)
        setLoading(true)
        inputNumControl.postDelayed({
            val user = MockData.findUser(numControl, password)
            setLoading(false)

            when {
                user == null -> showError("Credenciales incorrectas.")

                // RF-01: ADMIN y CUT no deben usar la app móvil
                user.rol == UserRole.ADMIN || user.rol == UserRole.CUT ->
                    showError("Este rol no tiene acceso a la aplicación móvil.\nUtiliza la plataforma web.")

                else -> {
                    AuthManager.saveSession(this, user)
                    navigateAfterLogin(user)
                }
            }
        }, 800)
    }

    private fun navigateAfterLogin(user: User) {
        val operation = MockData.getOperationForUser(user.id)

        val intent = when {
            // Sin operación asignada o operación inactiva → pantalla de espera
            operation == null || operation.status == OperationStatus.INACTIVA ->
                Intent(this, OperationStatusActivity::class.java)

            // Operación en curso → pantalla operativa con mapa
            operation.status == OperationStatus.EN_REALIZACION ->
                Intent(this, MainActivity::class.java)

            // Operación realizada (no debería llegar aquí, pero por seguridad)
            else -> Intent(this, OperationStatusActivity::class.java)
        }

        // Pasar datos del usuario y la operación a la siguiente pantalla
        intent.putExtra("USER_ID", user.id)
        intent.putExtra("OPERATION_ID", operation?.id ?: -1)

        startActivity(intent)
        finish() // no volver al login con el botón atrás
    }

    private fun showError(msg: String) {
        tvError.text = msg
        tvError.visibility = View.VISIBLE
        // Vibrar el campo de contraseña como feedback
        inputPassword.animate().translationX(10f).setDuration(50)
            .withEndAction {
                inputPassword.animate().translationX(-10f).setDuration(50)
                    .withEndAction {
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