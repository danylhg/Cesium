package com.operaciones.operaciones_android.ui

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import com.operaciones.operaciones_android.R
import com.operaciones.operaciones_android.auth.AuthManager

class OperationStatusActivity : AppCompatActivity() {

    private lateinit var tvTitulo: TextView
    private lateinit var tvMensaje: TextView
    private lateinit var btnSalir: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_operation_status)

        tvTitulo = findViewById(R.id.tvStatusTitle)
        tvMensaje = findViewById(R.id.tvStatusMessage)
        btnSalir = findViewById(R.id.btnLogout)

        val operationId = intent.getIntExtra("OPERATION_ID", -1)
        val estado = intent.getStringExtra("OP_ESTADO") ?: ""

        configurarMensaje(operationId, estado)

        btnSalir.setOnClickListener {
            salirAlLogin()
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                salirAlLogin()
            }
        })
    }

    private fun configurarMensaje(operationId: Int, estado: String) {
        if (operationId == -1) {
            tvTitulo.text = "Sin operación asignada"
            tvMensaje.text = "No tienes una operación asignada en este momento."
            return
        }

        when (estado.uppercase()) {
            "PLANIFICADA" -> {
                tvTitulo.text = "Operación no activa"
                tvMensaje.text = "Tu operación asignada todavía no está activa."
            }
            "CERRADA" -> {
                tvTitulo.text = "Operación finalizada"
                tvMensaje.text = "Tu operación asignada ya fue cerrada."
            }
            "CANCELADA" -> {
                tvTitulo.text = "Operación cancelada"
                tvMensaje.text = "Tu operación asignada fue cancelada."
            }
            else -> {
                tvTitulo.text = "Operación no disponible"
                tvMensaje.text = "No es posible ingresar a la operación en este momento."
            }
        }
    }

    private fun salirAlLogin() {
        AuthManager.logout(this)

        val intent = Intent(this, LoginActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }

        startActivity(intent)
        finish()
    }
}