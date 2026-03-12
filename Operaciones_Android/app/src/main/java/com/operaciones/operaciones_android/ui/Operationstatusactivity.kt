package com.operaciones.operaciones_android.ui

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

import com.operaciones.operaciones_android.R
import com.operaciones.operaciones_android.auth.AuthManager
import com.operaciones.operaciones_android.model.Operation
import com.operaciones.operaciones_android.model.OperationStatus
import com.operaciones.operaciones_android.model.User
import com.operaciones.operaciones_android.network.OperationStatusRepository

class OperationStatusActivity : AppCompatActivity() {

    private lateinit var currentUser: User
    private val operationStatusRepository = OperationStatusRepository()
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

    // Datos de la operación leídos del intent (vienen de la API vía LoginActivity)
    private var opId       = -1
    private var opNombre   = ""
    private var opCodigo   = ""
    private var opDesc     = ""
    private var opPrioridad = ""
    private var opFechaInicio = ""
    private var opFechaFin    = ""
    private var opEstado   = ""

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

        currentUser = AuthManager.getCurrentUser(this) ?: run {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        // Leer todos los datos de la operación desde el intent
        // Estos valores fueron llenados por LoginActivity con datos reales de la API
        opId          = intent.getIntExtra("OPERATION_ID", -1)
        opNombre      = intent.getStringExtra("OP_NOMBRE")      ?: ""
        opCodigo      = intent.getStringExtra("OP_CODIGO")      ?: ""
        opDesc        = intent.getStringExtra("OP_DESCRIPCION") ?: ""
        opPrioridad   = intent.getStringExtra("OP_PRIORIDAD")   ?: "MEDIA"
        opFechaInicio = intent.getStringExtra("OP_FECHA_INICIO") ?: ""
        opFechaFin    = intent.getStringExtra("OP_FECHA_FIN")    ?: ""
        // El estado de la operación determina qué pantalla mostrar.
        // Si no viene en el intent (compatibilidad), se asume PLANIFICADA.
        opEstado      = intent.getStringExtra("OP_ESTADO")      ?: "PLANIFICADA"

        renderUserInfo(currentUser)
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
        if (opId <= 0 || opNombre.isBlank()) {
            // Sin operación asignada
            tvStatusTitle.text       = "Sin operación asignada"
            tvStatusMessage.text     = "No tienes ninguna operación activa o programada.\nEl administrador o CUT te asignará próximamente."
            cardOperation.visibility = View.GONE
            return
        }

        // Hay operación asignada — mostrar card con datos reales de la API
        tvStatusTitle.text       = "Operación programada"
        tvStatusMessage.text     = "Tu operación aún no ha iniciado.\nPermanece en espera hasta la fecha indicada."
        cardOperation.visibility = View.VISIBLE

        tvOperationName.text = opNombre
        tvOperationZone.text = if (opDesc.isNotBlank()) "📋 $opDesc" else "📋 Sin descripción"
        tvOperationDate.text = buildString {
            if (opFechaInicio.isNotBlank()) append("🕐 Inicio: $opFechaInicio")
            if (opFechaFin.isNotBlank())    append("  —  Fin: $opFechaFin")
        }
        tvMainMessage.text = if (opCodigo.isNotBlank()) "Código: $opCodigo" else ""

        val (color, label) = when (opPrioridad.uppercase()) {
            "ALTA"  -> Pair("#ef4444", "● PRIORIDAD ALTA")
            "MEDIA" -> Pair("#f59e0b", "● PRIORIDAD MEDIA")
            else    -> Pair("#22c55e", "● PRIORIDAD BAJA")
        }
        tvOperationPriority.text = label
        tvOperationPriority.setTextColor(Color.parseColor(color))
    }

    private fun checkOperationStatus() {
        val token = AuthManager.getToken(this)

        operationStatusRepository.fetchAssignedOperation(
            userId = currentUser.id,
            token = token,
            onSuccess = { operation ->
                runOnUiThread {
                    btnRefresh.isEnabled = true
                    btnRefresh.text = "Verificar estado"

                    if (operation == null) {
                        opId = -1
                        opNombre = ""
                        opCodigo = ""
                        opDesc = ""
                        opPrioridad = "MEDIA"
                        opFechaInicio = ""
                        opFechaFin = ""
                        opEstado = "SIN_ASIGNACION"
                        renderOperationStatus()
                        return@runOnUiThread
                    }

                    updateOperationFields(operation)

                    if (operation.status == OperationStatus.ACTIVA) {
                        navigateToMain(operation)
                    } else {
                        renderOperationStatus()
                    }
                }
            },
            onError = { message ->
                runOnUiThread {
                    btnRefresh.isEnabled = true
                    btnRefresh.text = "Verificar estado"
                    tvStatusMessage.text = message
                }
            }
        )
    }

    private fun updateOperationFields(operation: Operation) {
        opId = operation.id
        opNombre = operation.nombre
        opCodigo = operation.codigo
        opDesc = operation.descripcion
        opPrioridad = operation.prioridad
        opFechaInicio = operation.fechaInicio
        opFechaFin = operation.fechaFin
        opEstado = operation.status.name
    }

    private fun navigateToMain(operation: Operation) {
        startActivity(
            Intent(this, MainActivity::class.java).apply {
                putExtra("USER_ID", currentUser.id)
                putExtra("OPERATION_ID", operation.id)
                putExtra("OP_ESTADO", operation.status.name)
                putExtra("OP_CODIGO", operation.codigo)
                putExtra("OP_NOMBRE", operation.nombre)
                putExtra("OP_DESCRIPCION", operation.descripcion)
                putExtra("OP_PRIORIDAD", operation.prioridad)
                putExtra("OP_FECHA_INICIO", operation.fechaInicio)
                putExtra("OP_FECHA_FIN", operation.fechaFin)
                putExtra("OP_LAT", operation.zonaLat)
                putExtra("OP_LON", operation.zonaLon)
                putExtra("OP_ZOOM", operation.zonaZoom)
            }
        )
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        refreshHandler.removeCallbacksAndMessages(null)
    }
}