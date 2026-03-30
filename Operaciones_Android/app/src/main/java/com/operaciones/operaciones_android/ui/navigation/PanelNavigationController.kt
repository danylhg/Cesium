package com.operaciones.operaciones_android.ui.navigation

import android.graphics.Color
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

class PanelNavigationController(
    private val panelContent: FrameLayout,
    private val btnNavOperation: LinearLayout,
    private val btnNavChat: LinearLayout,
    private val btnNavPersonal: LinearLayout,
    private val btnNavVehiculos: LinearLayout,
    private val btnNavEquipos: LinearLayout,
    private val host: Host
) {

    enum class Panel {
        NONE,
        OPERATION,
        CHAT,
        PERSONAL,
        VEHICULOS,
        EQUIPOS
    }

    interface Host {
        fun inflateOperationPanel()
        fun inflateChatPanel()
        fun inflatePersonalPanel()
        fun inflateVehiculoPanel()
        fun inflateEquipoPanel()
    }

    var activePanel: Panel = Panel.NONE
        private set

    fun setupNavigation() {
        btnNavOperation.setOnClickListener { togglePanel(Panel.OPERATION) }
        btnNavChat.setOnClickListener { togglePanel(Panel.CHAT) }
        btnNavPersonal.setOnClickListener { togglePanel(Panel.PERSONAL) }
        btnNavVehiculos.setOnClickListener { togglePanel(Panel.VEHICULOS) }
        btnNavEquipos.setOnClickListener { togglePanel(Panel.EQUIPOS) }
    }

    fun togglePanel(panel: Panel) {
        showPanel(if (activePanel == panel) Panel.NONE else panel)
    }

    fun showPanel(panel: Panel) {
        activePanel = panel
        panelContent.removeAllViews()

        setNavActive(btnNavOperation, panel == Panel.OPERATION)
        setNavActive(btnNavChat, panel == Panel.CHAT)
        setNavActive(btnNavPersonal, panel == Panel.PERSONAL)
        setNavActive(btnNavVehiculos, panel == Panel.VEHICULOS)
        setNavActive(btnNavEquipos, panel == Panel.EQUIPOS)

        if (panel == Panel.NONE) {
            panelContent.visibility = View.GONE
            return
        }

        panelContent.visibility = View.VISIBLE

        when (panel) {
            Panel.OPERATION -> host.inflateOperationPanel()
            Panel.CHAT -> host.inflateChatPanel()
            Panel.PERSONAL -> host.inflatePersonalPanel()
            Panel.VEHICULOS -> host.inflateVehiculoPanel()
            Panel.EQUIPOS -> host.inflateEquipoPanel()
            Panel.NONE -> {}
        }
    }

    private fun setNavActive(btn: LinearLayout, active: Boolean) {
        (btn.getChildAt(1) as? TextView)?.setTextColor(
            if (active) Color.parseColor("#3b82f6") else Color.parseColor("#64748b")
        )
        btn.setBackgroundColor(
            if (active) Color.parseColor("#0d1f3c") else Color.TRANSPARENT
        )
    }
}