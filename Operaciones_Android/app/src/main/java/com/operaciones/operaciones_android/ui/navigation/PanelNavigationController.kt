package com.operaciones.operaciones_android.ui.navigation

import android.graphics.Color
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

class PanelNavigationController(
    private val panelContent: FrameLayout,
    private val btnNavChat: LinearLayout,
    private val btnNavPersonal: LinearLayout,
    private val btnNavEquipo: LinearLayout,
    private val host: Host
) {

    enum class Panel { NONE, CHAT, PERSONAL, EQUIPO }

    interface Host {
        fun inflateChatPanel()
        fun inflatePersonalPanel()
        fun inflateEquipoPanel()
    }

    var activePanel: Panel = Panel.NONE
        private set

    fun setupNavigation() {
        btnNavChat.setOnClickListener { togglePanel(Panel.CHAT) }
        btnNavPersonal.setOnClickListener { togglePanel(Panel.PERSONAL) }
        btnNavEquipo.setOnClickListener { togglePanel(Panel.EQUIPO) }
    }

    fun togglePanel(panel: Panel) {
        showPanel(if (activePanel == panel) Panel.NONE else panel)
    }

    fun showPanel(panel: Panel) {
        activePanel = panel
        panelContent.removeAllViews()

        setNavActive(btnNavChat, panel == Panel.CHAT)
        setNavActive(btnNavPersonal, panel == Panel.PERSONAL)
        setNavActive(btnNavEquipo, panel == Panel.EQUIPO)

        if (panel == Panel.NONE) {
            panelContent.visibility = View.GONE
            return
        }

        panelContent.visibility = View.VISIBLE
        when (panel) {
            Panel.CHAT -> host.inflateChatPanel()
            Panel.PERSONAL -> host.inflatePersonalPanel()
            Panel.EQUIPO -> host.inflateEquipoPanel()
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