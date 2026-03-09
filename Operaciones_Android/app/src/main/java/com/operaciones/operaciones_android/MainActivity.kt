package com.operaciones.operaciones_android

import android.os.Bundle
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
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

        webView      = findViewById(R.id.cesiumWebView)
        chatRecycler = findViewById(R.id.chatRecycler)
        msgInput     = findViewById(R.id.msgInput)
        sendBtn      = findViewById(R.id.sendBtn)
        alertText    = findViewById(R.id.alertText)

        // Habilitar hardware acceleration en el WebView
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccessFromFileURLs = true
            allowUniversalAccessFromFileURLs = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(false)
            // Necesario para WebGL de Cesium
            mediaPlaybackRequiresUserGesture = false
        }

        // WebChromeClient permite WebGL y muestra errores JS en Logcat
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                android.util.Log.d(
                    "CesiumJS",
                    "${msg.message()} — línea ${msg.lineNumber()} de ${msg.sourceId()}"
                )
                return true
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                android.util.Log.d("CesiumJS", "Página cargada: $url")
            }

            override fun onReceivedError(
                view: WebView,
                errorCode: Int,
                description: String,
                failingUrl: String
            ) {
                android.util.Log.e("CesiumJS", "Error $errorCode: $description en $failingUrl")
            }
        }

        webView.addJavascriptInterface(JsBridge(), "Android")
        
        val html = assets.open("map.html").bufferedReader().use { it.readText() }
        webView.loadDataWithBaseURL(
            "https://cesium.com",   // base URL — permite cargar recursos externos
            html,
            "text/html",
            "UTF-8",
            null
        )

        // RecyclerView del chat
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