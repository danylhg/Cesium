package com.operaciones.operaciones_android

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity

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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_operation_status)

        tvUserName          = findViewById(R.id.tvUserName)
        tvUserRole          = findViewById(R.id.tvUserRole)
        tvUserHierarchy     = findViewById(R.id.tvUserHierarchy)
        tvStatusTitle       = findViewById(R.id.tvStatusTitle)
        tvStatusMessage     = findViewById(R.id.tvStatusMessage)
        tvOperationName     = findViewById(R.id.tvOperationName)
        tvOperationZone     = findViewById(R.id.tvOperationZone)
        tvOperationDate     = findViewById(R.id.tvOperationDate)
        tvOperationPriority = findViewById(R.id.tvOperationPriority)
        tvMainMessage       = findViewById(R.id.tvMainMessage)
        cardOperation       = findViewById(R.id.cardOperation)
        btnLogout           = findViewById(R.id.btnLogout)
        btnRefresh          = findViewById(R.id.btnRefresh)

        val user = AuthManager.getCurrentUser(this) ?: run {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        renderUserInfo(user)
        renderOperationStatus()

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

    private fun renderOperationStatus() {
        // Busca operación en MockData (fallback) usando el id del intent
        val opId = intent.getIntExtra("OPERATION_ID", -1)
        val operation: Operation? = if (opId > 0)
            MockData.operations.find { it.id == opId }
        else
            null

        if (operation == null) {
            tvStatusTitle.text   = "Sin operación asignada"
            tvStatusMessage.text = "No tienes ninguna operación activa o programada.\nEl administrador o CUT te asignará próximamente."
            cardOperation.visibility = View.GONE
        } else {
            tvStatusTitle.text   = "Operación programada"
            tvStatusMessage.text = "Tu operación aún no ha iniciado.\nPermanece en espera hasta la fecha indicada."
            cardOperation.visibility = View.VISIBLE

            tvOperationName.text = operation.nombre
            // 'zona' fue reemplazado por 'descripcion' en el nuevo modelo
            tvOperationZone.text = "📋 ${operation.descripcion}"
            tvOperationDate.text = "🕐 Inicio: ${operation.fechaInicio}  —  Fin: ${operation.fechaFin}"
            // 'mensajePrincipal' fue eliminado — usamos codigo + prioridad
            tvMainMessage.text   = "Código: ${operation.codigo}"

            val (color, label) = when (operation.prioridad.uppercase()) {
                "ALTA"  -> Pair("#ef4444", "● PRIORIDAD ALTA")
                "MEDIA" -> Pair("#f59e0b", "● PRIORIDAD MEDIA")
                else    -> Pair("#22c55e", "● PRIORIDAD BAJA")
            }
            tvOperationPriority.text = label
            tvOperationPriority.setTextColor(Color.parseColor(color))
        }
    }

    private fun checkOperationStatus() {
        val user = AuthManager.getCurrentUser(this) ?: return
        val opId = intent.getIntExtra("OPERATION_ID", -1)
        val operation: Operation? = if (opId > 0)
            MockData.operations.find { it.id == opId }
        else
            null

        // Si la operación ahora está ACTIVA → ir al mapa
        if (operation != null && operation.status == OperationStatus.ACTIVA) {
            startActivity(
                Intent(this, MainActivity::class.java).apply {
                    putExtra("USER_ID",      user.id)
                    putExtra("OPERATION_ID", operation.id)
                }
            )
            finish()
        } else {
            renderOperationStatus()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        refreshHandler.removeCallbacksAndMessages(null)
    }
}