package com.operaciones.operaciones_android

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AlertDialog

class OperationStatusActivity : AppCompatActivity() {

    private lateinit var tvUserName: TextView
    private lateinit var tvUserRole: TextView
    private lateinit var tvUserHierarchy: TextView
    private lateinit var tvStatusTitle: TextView
    private lateinit var tvStatusMessage: TextView
    private lateinit var tvOperationName: TextView
    private lateinit var tvOperationZone: TextView
    private lateinit var tvOperationDate: TextView
    private lateinit var tvOperationPriority: TextView
    private lateinit var tvMainMessage: TextView
    private lateinit var cardOperation: View
    private lateinit var btnLogout: Button
    private lateinit var btnRefresh: Button

    private val refreshHandler = Handler(Looper.getMainLooper())
    private val refreshRunnable = Runnable { checkOperationStatus() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_operation_status)

        tvUserName       = findViewById(R.id.tvUserName)
        tvUserRole       = findViewById(R.id.tvUserRole)
        tvUserHierarchy  = findViewById(R.id.tvUserHierarchy)
        tvStatusTitle    = findViewById(R.id.tvStatusTitle)
        tvStatusMessage  = findViewById(R.id.tvStatusMessage)
        tvOperationName  = findViewById(R.id.tvOperationName)
        tvOperationZone  = findViewById(R.id.tvOperationZone)
        tvOperationDate  = findViewById(R.id.tvOperationDate)
        tvOperationPriority = findViewById(R.id.tvOperationPriority)
        tvMainMessage    = findViewById(R.id.tvMainMessage)
        cardOperation    = findViewById(R.id.cardOperation)
        btnLogout        = findViewById(R.id.btnLogout)
        btnRefresh       = findViewById(R.id.btnRefresh)

        val user = AuthManager.getCurrentUser(this) ?: run {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        renderUserInfo(user)
        renderOperationStatus(user)

        btnLogout.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Cerrar sesión")
                .setMessage("¿Deseas cerrar tu sesión?")
                .setPositiveButton("Cerrar sesión") { _, _ ->
                    AuthManager.logout(this)
                    startActivity(Intent(this, LoginActivity::class.java))
                    finish()
                }
                .setNegativeButton("Cancelar", null)
                .show()
        }

        btnRefresh.setOnClickListener {
            btnRefresh.isEnabled = false
            btnRefresh.text = "Verificando..."
            // Simula consulta al servidor
            refreshHandler.postDelayed({
                btnRefresh.isEnabled = true
                btnRefresh.text = "Verificar estado"
                checkOperationStatus()
            }, 1200)
        }
    }

    private fun renderUserInfo(user: User) {
        tvUserName.text      = user.nombreCompleto
        tvUserRole.text      = user.rol.display
        tvUserHierarchy.text = user.jerarquia
    }

    private fun renderOperationStatus(user: User) {
        val operation = MockData.getOperationForUser(user.id)

        if (operation == null) {
            // Sin operación asignada
            tvStatusTitle.text   = "Sin operación asignada"
            tvStatusMessage.text = "No tienes ninguna operación activa o programada en este momento.\nEl Administrador o CUT te asignará a una operación próximamente."
            cardOperation.visibility = View.GONE
        } else {
            // Operación INACTIVA (próxima)
            tvStatusTitle.text   = "Operación programada"
            tvStatusMessage.text = "Tu operación aún no ha iniciado.\nPermanece en espera hasta la fecha indicada."
            cardOperation.visibility = View.VISIBLE

            tvOperationName.text     = operation.nombre
            tvOperationZone.text     = "📍 ${operation.zona}"
            tvOperationDate.text     = "🕐 Inicio: ${operation.fechaInicio}  —  Fin: ${operation.fechaFin}"
            tvMainMessage.text       = "\"${operation.mensajePrincipal}\""

            val (priorityColor, priorityLabel) = when (operation.prioridad) {
                "Alta"  -> Pair("#ef4444", "● PRIORIDAD ALTA")
                "Media" -> Pair("#f59e0b", "● PRIORIDAD MEDIA")
                else    -> Pair("#22c55e", "● PRIORIDAD BAJA")
            }
            tvOperationPriority.text = priorityLabel
            tvOperationPriority.setTextColor(android.graphics.Color.parseColor(priorityColor))
        }
    }

    /** Verifica si la operación cambió a EN_REALIZACION (simula polling) */
    private fun checkOperationStatus() {
        val user = AuthManager.getCurrentUser(this) ?: return
        val operation = MockData.getOperationForUser(user.id)

        if (operation?.status == OperationStatus.EN_REALIZACION) {
            val intent = Intent(this, MainActivity::class.java)
            intent.putExtra("USER_ID", user.id)
            intent.putExtra("OPERATION_ID", operation.id)
            startActivity(intent)
            finish()
        } else {
            renderOperationStatus(user)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        refreshHandler.removeCallbacks(refreshRunnable)
    }
}