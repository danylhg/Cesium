package com.operaciones.operaciones_android

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var chatRecycler: RecyclerView
    private lateinit var msgInput: EditText
    private lateinit var sendBtn: Button
    private lateinit var alertText: TextView

    private val messages = mutableListOf<ChatMessage>()
    private lateinit var chatAdapter: ChatAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Referencias a vistas
        webView      = findViewById(R.id.cesiumWebView)
        chatRecycler = findViewById(R.id.chatRecycler)
        msgInput     = findViewById(R.id.msgInput)
        sendBtn      = findViewById(R.id.sendBtn)
        alertText    = findViewById(R.id.alertText)

        // Configurar WebView para Cesium
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccessFromFileURLs = true
            allowUniversalAccessFromFileURLs = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
        webView.webViewClient = WebViewClient()
        webView.addJavascriptInterface(JsBridge(), "Android")
        webView.loadUrl("file:///android_asset/map.html")

        // Configurar RecyclerView del chat
        chatAdapter = ChatAdapter(messages)
        chatRecycler.layoutManager = LinearLayoutManager(this).apply {
            stackFromEnd = true
        }
        chatRecycler.adapter = chatAdapter

        // Botón enviar
        sendBtn.setOnClickListener {
            val text = msgInput.text.toString().trim()
            if (text.isNotEmpty()) {
                addMessage(ChatMessage("Tú", text))
                msgInput.text.clear()
            }
        }
    }

    fun addMessage(msg: ChatMessage) {
        runOnUiThread {
            messages.add(msg)
            chatAdapter.notifyItemInserted(messages.size - 1)
            chatRecycler.scrollToPosition(messages.size - 1)
        }
    }

    fun showAlert(text: String) {
        runOnUiThread {
            alertText.text = "⚠️ $text"
        }
    }

    // Bridge entre CesiumJS y Kotlin
    inner class JsBridge {
        @JavascriptInterface
        fun onMapTapped(lat: Double, lon: Double) {
            addMessage(ChatMessage("Sistema", "Marcaste: $lat, $lon"))
        }

        @JavascriptInterface
        fun sendTrafficAlert(message: String) {
            showAlert(message)
            addMessage(ChatMessage("Alerta", message))
        }
    }
}