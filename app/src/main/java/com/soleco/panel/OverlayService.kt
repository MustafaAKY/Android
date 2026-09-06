package com.soleco.panel

import android.annotation.SuppressLint
import android.app.*
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.PixelFormat
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.MediaStore
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

class OverlayService : Service() {

    private lateinit var windowManager: WindowManager
    private var bubbleView: ImageView? = null
    private var bubbleParams: WindowManager.LayoutParams? = null
    private var bubbleCollapsed = false
    private var bubbleOnLeftEdge = true
    private val bubbleSize = 140
    private val bubblePeekPx = (bubbleSize * 0.35).toInt()
    private val collapseRunnable = Runnable { collapseBubbleIfIdle() }
    private var panelContainer: View? = null
    private var panelWebView: WebView? = null
    private var panelParams: WindowManager.LayoutParams? = null
    private var panelVisible = false
    private val http = OkHttpClient()
    private val mainHandler = Handler(Looper.getMainLooper())

    companion object {
        private const val CHANNEL_ID = "soleco_overlay"
        private const val CARGO_URL = "http://webpostman.yesilkarkargo.com:9999/restapi/client/cargo"
        private const val CARGO_KEY = "jE6csb3PTtLYAdya87Bnp91G0NJfMSCXUZxmHz4r"
        private const val CARGO_FROM = "seffafbutik@yesilkar.com"
        private const val SUPABASE_URL = "https://awnfcflnunsfyuifzvdy.supabase.co"
        private const val SUPABASE_KEY =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
            "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3bmZjZmxudW5zZnl1aWZ6dmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTg5NTcsImV4cCI6MjA4NzE3NDk1N30." +
            "eMmertoyKxUyrarIOQNapZ3rphqKfeAqSbPpWuRiaaU"
        private const val WARMUP_INTERVAL_MS = 3 * 60 * 1000L // 3 dakika
    }

    private val warmupRunnable: Runnable = object : Runnable {
        override fun run() {
            warmUpSupabase()
            mainHandler.postDelayed(this, WARMUP_INTERVAL_MS)
        }
    }

    /**
     * Supabase'e minik, sonucu hiç kullanılmayan bir sorgu atar — tek amacı
     * TLS/HTTP2 bağlantısını sıcak tutmak. "Siparişi Getir"e ilk bastığında
     * bağlantı kurma süresini (el sıkışma) baştan yaşamamak için servis açık
     * olduğu sürece birkaç dakikada bir tekrarlanır. Maliyeti birkaç KB'lık
     * bir istek — pil/veri açısından ihmal edilebilir düzeyde.
     */
    private fun warmUpSupabase() {
        val req = Request.Builder()
            .url("$SUPABASE_URL/rest/v1/orders?select=id&limit=1")
            .addHeader("apikey", SUPABASE_KEY)
            .addHeader("Authorization", "Bearer $SUPABASE_KEY")
            .build()
        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) { /* sessizce geç */ }
            override fun onResponse(call: Call, response: Response) { response.close() }
        })
    }

    private val headerReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val text = intent?.getStringExtra(WhatsAppAccessibilityService.EXTRA_TEXT) ?: return
            panelWebView?.evaluateJavascript(
                "window.AndroidOnHeaderText && window.AndroidOnHeaderText(${JSONObject.quote(text)});",
                null
            )
        }
    }

    override fun onCreate() {
        super.onCreate()
        startForeground(1, buildNotification())
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        LocalBroadcastManager.getInstance(this).registerReceiver(
            headerReceiver, IntentFilter(WhatsAppAccessibilityService.ACTION_HEADER_TEXT)
        )
        addBubble()
        mainHandler.post(warmupRunnable)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "SOLE&CO Panel", NotificationManager.IMPORTANCE_MIN
            )
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SOLE&CO sipariş paneli aktif")
            .setSmallIcon(android.R.drawable.ic_menu_send)
            .setOngoing(true)
            .build()
    }

    private fun overlayType() =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

    @SuppressLint("ClickableViewAccessibility")
    private fun addBubble() {
        val bubble = ImageView(this).apply {
            setImageResource(android.R.drawable.ic_menu_myplaces)
            setBackgroundColor(Color.parseColor("#25D366"))
            setPadding(24, 24, 24, 24)
        }
        val params = WindowManager.LayoutParams(
            bubbleSize, bubbleSize, overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 0; y = 300
        }
        bubbleParams = params

        var downX = 0f; var downY = 0f; var startX = 0; var startY = 0; var moved = false
        bubble.setOnTouchListener { _, ev ->
            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    expandBubbleNow()
                    downX = ev.rawX; downY = ev.rawY
                    startX = params.x; startY = params.y
                    moved = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (ev.rawX - downX).toInt()
                    val dy = (ev.rawY - downY).toInt()
                    if (kotlin.math.abs(dx) > 8 || kotlin.math.abs(dy) > 8) moved = true
                    params.x = startX + dx
                    params.y = startY + dy
                    windowManager.updateViewLayout(bubble, params)
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!moved) {
                        togglePanel()
                    } else {
                        bubbleOnLeftEdge = params.x < resources.displayMetrics.widthPixels / 2
                        snapBubbleToEdge(fullyVisible = true)
                    }
                    if (!panelVisible) scheduleBubbleCollapse()
                    true
                }
                else -> false
            }
        }

        windowManager.addView(bubble, params)
        bubbleView = bubble
        scheduleBubbleCollapse()
    }

    private fun scheduleBubbleCollapse() {
        mainHandler.removeCallbacks(collapseRunnable)
        mainHandler.postDelayed(collapseRunnable, 2200L)
    }

    private fun collapseBubbleIfIdle() {
        if (panelVisible || bubbleCollapsed) return
        bubbleCollapsed = true
        snapBubbleToEdge(fullyVisible = false)
    }

    private fun expandBubbleNow() {
        mainHandler.removeCallbacks(collapseRunnable)
        if (bubbleCollapsed) {
            bubbleCollapsed = false
            snapBubbleToEdge(fullyVisible = true)
        }
    }

    /**
     * Baloncuğu kenara yaslar. Bazı üretici Android sürümleri (özellikle MIUI/
     * Xiaomi) overlay pencerelerinin ekranın dışına (negatif x) taşınmasına izin
     * vermiyor — bu yüzden "gizlerken" pencereyi ekran dışına kaydırmak yerine
     * pencerenin GENİŞLİĞİNİ küçültüyoruz; x her zaman 0 ile ekran genişliği
     * arasında kalır, hiçbir üretici bunu engellemez.
     */
    private fun snapBubbleToEdge(fullyVisible: Boolean) {
        val bubble = bubbleView ?: return
        val params = bubbleParams ?: return
        val dm = resources.displayMetrics
        val targetWidth = if (fullyVisible) bubbleSize else bubblePeekPx
        val targetX = if (bubbleOnLeftEdge) 0 else dm.widthPixels - targetWidth
        animateBubbleTo(bubble, params, targetX, targetWidth, if (fullyVisible) 1f else 0.5f)
    }

    /** Baloncuğu hedef x/genişlik/saydamlığa yumuşakça kaydırır. */
    private fun animateBubbleTo(bubble: View, params: WindowManager.LayoutParams, targetX: Int, targetWidth: Int, targetAlpha: Float) {
        val animator = android.animation.ValueAnimator.ofFloat(0f, 1f)
        val startX = params.x
        val startWidth = params.width
        val startAlpha = bubble.alpha
        animator.duration = 220
        animator.addUpdateListener { a ->
            val f = a.animatedValue as Float
            params.x = (startX + (targetX - startX) * f).toInt()
            params.width = (startWidth + (targetWidth - startWidth) * f).toInt().coerceAtLeast(1)
            bubble.alpha = startAlpha + (targetAlpha - startAlpha) * f
            runCatching { windowManager.updateViewLayout(bubble, params) }
        }
        animator.start()
    }

    /**
     * Panel artık ekranın küçük bir kısmını kaplıyor (genişlik %90, yükseklik %48)
     * ve alta sabitlenmiş — WhatsApp'ın üst kısmı (sohbet başlığı, mesajlar) hep
     * görünür kalsın diye. Üstteki başlık çubuğundan tutup sürükleyebilir,
     * X'e basıp kapatabilirsin.
     *
     * ÖNEMLİ: WebView artık her açılışta yeniden oluşturulmuyor — ilk açılışta
     * bir kere kurulup sayfa bir kere yüklenir, sonraki her açılış sadece aynı
     * pencereyi ekrana geri ekler. Bu sayede hem panel anında açılır (yeniden
     * yükleme yok) hem de JS tarafındaki ürün görseli önbelleği kalıcı olur.
     */
    @SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
    private fun togglePanel() {
        if (panelVisible) {
            panelContainer?.let { runCatching { windowManager.removeView(it) } }
            panelVisible = false
            scheduleBubbleCollapse()
            return
        }

        if (panelContainer == null) buildPanel()
        val container = panelContainer ?: return // buildPanel() az önce kurdu, teorik olarak hep dolu

        val dm = resources.displayMetrics
        val params = WindowManager.LayoutParams(
            (dm.widthPixels * 0.92).toInt(),
            (dm.heightPixels * 0.66).toInt(),
            overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            y = 8
        }
        panelParams = params

        windowManager.addView(container, params)
        panelVisible = true
    }

    /** Panel penceresini (başlık çubuğu + WebView) BİR KERE kurar. */
    private fun buildPanel() {
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#202C33"))
            setPadding(20, 10, 14, 10)
        }
        val title = TextView(this).apply {
            text = "⠿  SOLE&CO — sürükle"
            setTextColor(Color.parseColor("#E9EDEF"))
            textSize = 11f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val closeBtn = TextView(this).apply {
            text = "✕"
            setTextColor(Color.parseColor("#E9EDEF"))
            textSize = 16f
            setPadding(24, 0, 4, 0)
            setOnClickListener { togglePanel() }
        }
        header.addView(title)
        header.addView(closeBtn)

        // Başlık çubuğundan sürükleyerek pencereyi taşı — panelParams alanı
        // her açılışta güncellendiği için burada hep "o anki" pencereyi kullanır.
        var downX = 0f; var downY = 0f; var startX = 0; var startY = 0
        header.setOnTouchListener { _, ev ->
            val params = panelParams ?: return@setOnTouchListener false
            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    downX = ev.rawX; downY = ev.rawY
                    startX = params.x; startY = params.y
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    params.x = startX + (ev.rawX - downX).toInt()
                    // gravity BOTTOM olduğu için yukarı sürüklemek y'yi artırmalı
                    params.y = startY - (ev.rawY - downY).toInt()
                    val container = panelContainer
                    if (container != null) runCatching { windowManager.updateViewLayout(container, params) }
                    true
                }
                else -> false
            }
        }

        val webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            addJavascriptInterface(WebAppInterface(), "AndroidBridge")
            loadUrl("file:///android_asset/panel/sidepanel.html")
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f
            )
        }

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#111B21"))
            addView(header)
            addView(webView)
        }

        panelContainer = container
        panelWebView = webView
    }

    override fun onDestroy() {
        super.onDestroy()
        mainHandler.removeCallbacks(warmupRunnable)
        LocalBroadcastManager.getInstance(this).unregisterReceiver(headerReceiver)
        bubbleView?.let { runCatching { windowManager.removeView(it) } }
        panelContainer?.let { runCatching { windowManager.removeView(it) } }
    }

    /** WebView içindeki sidepanel.js'in çağırdığı Kotlin köprüsü. */
    inner class WebAppInterface {

        @JavascriptInterface
        fun closePanel() {
            mainHandler.post { togglePanel() }
        }

        @JavascriptInterface
        fun copyText(text: String) {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("soleco", text))
        }

        /** Telefon numarası yapıştır butonu için: panodaki metni okur. */
        @JavascriptInterface
        fun getClipboardText(): String {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = cm.primaryClip ?: return ""
            if (clip.itemCount == 0) return ""
            return clip.getItemAt(0).coerceToText(this@OverlayService).toString()
        }

        /** Metni doğrudan WhatsApp mesaj kutusuna yazar (göndermez). */
        @JavascriptInterface
        fun insertToWhatsApp(text: String): Boolean {
            return WhatsAppAccessibilityService.insertMessageText(text)
        }

        /**
         * Ürün görseli önbelleği — telefonun kalıcı deposuna (SharedPreferences,
         * tek küçük dosya) yazılır. Uygulamayı tamamen kapatıp açsan bile,
         * telefonu yeniden başlatsan bile kaybolmaz. Sadece "Görselleri
         * Güncelle"ye bastığında temizlenir. Boyutu birkaç KB — RAM'de ekstra
         * bir şey tutmuyoruz, disk okuma/yazması anlık.
         */
        @JavascriptInterface
        fun getCachedImages(): String {
            return getSharedPreferences("image_cache", Context.MODE_PRIVATE)
                .getString("map", "{}") ?: "{}"
        }

        @JavascriptInterface
        fun saveCachedImages(json: String) {
            getSharedPreferences("image_cache", Context.MODE_PRIVATE)
                .edit().putString("map", json).apply()
        }

        @JavascriptInterface
        fun clearCachedImages() {
            getSharedPreferences("image_cache", Context.MODE_PRIVATE)
                .edit().remove("map").apply()
        }

        /**
         * Görseli indirip telefonun Galerisine kaydeder (Pictures/SoleCoPanel).
         * Kopyalama değil, doğrudan indirme — WhatsApp'a eklemek için galeriden
         * seçersin.
         */
        @JavascriptInterface
        fun downloadImage(url: String) {
            val req = Request.Builder().url(url).build()
            http.newCall(req).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    notifyImageCopied(false)
                }

                override fun onResponse(call: Call, response: Response) {
                    response.use { resp ->
                        if (!resp.isSuccessful) { notifyImageCopied(false); return }
                        try {
                            val contentType = resp.header("Content-Type") ?: "image/jpeg"
                            val ext = when {
                                contentType.contains("png") -> "png"
                                contentType.contains("webp") -> "webp"
                                else -> "jpg"
                            }
                            val fileName = "soleco_${System.currentTimeMillis()}.$ext"
                            val bytes = resp.body?.bytes()
                            if (bytes == null) { notifyImageCopied(false); return }

                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                val values = ContentValues().apply {
                                    put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
                                    put(MediaStore.Images.Media.MIME_TYPE, contentType)
                                    put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/SoleCoPanel")
                                }
                                val uri = contentResolver.insert(
                                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values
                                )
                                if (uri == null) { notifyImageCopied(false); return }
                                contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                            } else {
                                @Suppress("DEPRECATION")
                                val dir = File(
                                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                                    "SoleCoPanel"
                                ).apply { mkdirs() }
                                val file = File(dir, fileName)
                                FileOutputStream(file).use { it.write(bytes) }
                                MediaScannerConnection.scanFile(
                                    this@OverlayService, arrayOf(file.absolutePath), null, null
                                )
                            }
                            notifyImageCopied(true)
                        } catch (e: Exception) {
                            notifyImageCopied(false)
                        }
                    }
                }
            })
        }

        private fun notifyImageCopied(ok: Boolean) {
            mainHandler.post {
                panelWebView?.evaluateJavascript(
                    "window.AndroidOnImageCopied && window.AndroidOnImageCopied($ok);", null
                )
            }
        }

        /**
         * background.js'teki FETCH_CARGO proxy'sinin Kotlin karşılığı.
         * HTTP (cleartext) + üçüncü parti API çağrısı native tarafta yapılır,
         * sonuç JSON olarak panele geri fısıldanır.
         *
         * ÖNEMLİ: iki aday numara (kendisi + sonuna "0" eklenmiş hali) için
         * istekler PARALEL/eş zamanlı gidiyor — iki farklı arka plan
         * thread'i aynı anda tamamlanabiliyor. Sayaç (pending) ve sonuç
         * listesi (results) bu yüzden thread-safe olmak ZORUNDA; düz bir
         * `var` ile azaltma yarış durumuna girip sayacı yanlışlıkla hiç
         * sıfıra düşürmeyebiliyordu — bu da "Kargo Takip" düğmesinin
         * bazen sonsuza kadar pasif kalmasına (JS tarafı hiç yanıt
         * alamadığı için) sebep oluyordu.
         */
        @JavascriptInterface
        fun fetchCargo(phone: String) {
            val candidates = listOf(phone, phone + "0")
            val results = JSONArray()
            val pending = java.util.concurrent.atomic.AtomicInteger(candidates.size)

            fun finish() {
                mainHandler.post {
                    panelWebView?.evaluateJavascript(
                        "window.AndroidOnCargoResult && window.AndroidOnCargoResult(${results});",
                        null
                    )
                }
            }

            for (sipno in candidates) {
                val url = "$CARGO_URL?sipno=$sipno"
                val req = Request.Builder()
                    .url(url)
                    .addHeader("Authorization", CARGO_KEY)
                    .addHeader("From", CARGO_FROM)
                    .addHeader("Content-Type", "application/json")
                    .build()

                http.newCall(req).enqueue(object : Callback {
                    override fun onFailure(call: Call, e: IOException) {
                        if (pending.decrementAndGet() == 0) finish()
                    }

                    override fun onResponse(call: Call, response: Response) {
                        response.use {
                            if (it.isSuccessful) {
                                val body = it.body?.string().orEmpty()
                                runCatching {
                                    val arr = JSONObject(body).optJSONArray("data") ?: JSONArray()
                                    // results birden fazla thread'den doldurulabiliyor —
                                    // JSONArray kendi başına thread-safe değil.
                                    synchronized(results) {
                                        for (i in 0 until arr.length()) results.put(arr.getJSONObject(i))
                                    }
                                }
                            }
                        }
                        if (pending.decrementAndGet() == 0) finish()
                    }
                })
            }
        }
    }
}
