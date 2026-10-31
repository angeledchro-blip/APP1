package com.sky.practica

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout

/**
 * La app es un "cascarón": abre la web de Cloudflare y le presta la cámara y el micrófono.
 * Todo lo demás (ejercicios, acordes, afinador, correcciones) vive en la web, así que
 * los cambios se ven en la app sin reinstalar.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private var permisoPendiente: PermissionRequest? = null
    private val hostWeb: String? by lazy { Uri.parse(BuildConfig.WEB_URL).host }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val raiz = FrameLayout(this)
        raiz.setBackgroundColor(FONDO)
        web = WebView(this)
        web.setBackgroundColor(FONDO)
        raiz.addView(
            web,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        setContentView(raiz)
        respetarBarrasDelSistema(raiz)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            setSupportZoom(false)
            builtInZoomControls = false
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == hostWeb) return false
                // Enlaces de afuera se abren en el navegador
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                } catch (e: ActivityNotFoundException) {
                    // no hay navegador: se ignora
                }
                return true
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) mostrarSinConexion()
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { pedirPermisos(request) }
            }
        }

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState)
        } else {
            web.loadUrl(BuildConfig.WEB_URL)
        }
    }

    // La web pide cámara o micrófono: primero se pide el permiso de Android y luego se le da a la web.
    private fun pedirPermisos(request: PermissionRequest) {
        if (request.origin.host != hostWeb) {
            request.deny()
            return
        }
        val necesarios = request.resources.mapNotNull { permisoAndroid(it) }.distinct()
        val faltan = necesarios.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (faltan.isEmpty()) {
            request.grant(request.resources)
        } else {
            permisoPendiente?.deny()
            permisoPendiente = request
            requestPermissions(faltan.toTypedArray(), CODIGO_PERMISOS)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != CODIGO_PERMISOS) return
        val request = permisoPendiente ?: return
        permisoPendiente = null
        val concedidos = request.resources.filter { recurso ->
            val permiso = permisoAndroid(recurso)
            permiso != null && checkSelfPermission(permiso) == PackageManager.PERMISSION_GRANTED
        }
        if (concedidos.isEmpty()) request.deny() else request.grant(concedidos.toTypedArray())
    }

    private fun permisoAndroid(recurso: String): String? = when (recurso) {
        PermissionRequest.RESOURCE_VIDEO_CAPTURE -> Manifest.permission.CAMERA
        PermissionRequest.RESOURCE_AUDIO_CAPTURE -> Manifest.permission.RECORD_AUDIO
        else -> null
    }

    private fun mostrarSinConexion() {
        val html = """
            <!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
            <body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
              background:#1f2128;color:#edebe4;font-family:sans-serif;text-align:center;padding:24px;box-sizing:border-box">
              <div>
                <h2 style="margin:0 0 8px">Sin conexión</h2>
                <p style="color:#a9a9b0;margin:0 0 20px">No se pudo abrir Práctica. Revisa tu internet y vuelve a intentar.</p>
                <a href="${BuildConfig.WEB_URL}" style="display:inline-block;padding:14px 22px;border-radius:12px;
                  background:#b4b0f2;color:#23213f;font-weight:bold;text-decoration:none">Reintentar</a>
              </div>
            </body></html>
        """.trimIndent()
        web.loadDataWithBaseURL(BuildConfig.WEB_URL, html, "text/html", "utf-8", null)
    }

    private fun respetarBarrasDelSistema(vista: View) {
        vista.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val b = insets.getInsets(
                    WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime()
                )
                v.setPadding(b.left, b.top, b.right, b.bottom)
            } else {
                @Suppress("DEPRECATION")
                v.setPadding(
                    insets.systemWindowInsetLeft,
                    insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight,
                    insets.systemWindowInsetBottom
                )
            }
            insets
        }
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    @Deprecated("Se usa para regresar dentro de la web")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    companion object {
        private const val CODIGO_PERMISOS = 7
        private val FONDO = Color.parseColor("#1F2128")
    }
}
