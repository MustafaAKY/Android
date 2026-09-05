package com.soleco.panel

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.TextUtils
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Basit izin ekranı:
 *  1) "Diğer uygulamaların üzerinde göster" izni (baloncuk için)
 *  2) Erişilebilirlik servisi izni (WhatsApp numarasını okumak için)
 * İkisi de verildiğinde OverlayService'i başlatır.
 */
class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 96, 48, 48)
        }

        val title = TextView(this).apply {
            text = "SOLE & CO — Sipariş Paneli"
            textSize = 20f
        }
        val status = TextView(this).apply {
            textSize = 14f
            setPadding(0, 32, 0, 32)
        }
        val overlayBtn = Button(this).apply {
            text = "1) Üstte gösterme izni ver"
            setOnClickListener {
                startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName")
                    )
                )
            }
        }
        val accessibilityBtn = Button(this).apply {
            text = "2) Erişilebilirlik servisini aç"
            setOnClickListener {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }
        }
        val startBtn = Button(this).apply {
            text = "Baloncuğu Başlat"
            setOnClickListener {
                startService(Intent(this@MainActivity, OverlayService::class.java))
                finish()
            }
        }

        root.addView(title)
        root.addView(status)
        root.addView(overlayBtn)
        root.addView(accessibilityBtn)
        root.addView(startBtn)
        setContentView(root)

        status.text = buildString {
            append(if (android.provider.Settings.canDrawOverlays(this@MainActivity))
                "✅ Üstte gösterme izni var\n" else "❌ Üstte gösterme izni yok\n")
            append(if (isAccessibilityServiceEnabled())
                "✅ Erişilebilirlik servisi açık" else "❌ Erişilebilirlik servisi kapalı")
        }
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val expected = "$packageName/${WhatsAppAccessibilityService::class.java.name}"
        val enabled = Settings.Secure.getString(
            contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val splitter = TextUtils.SimpleStringSplitter(':')
        splitter.setString(enabled)
        while (splitter.hasNext()) {
            if (splitter.next().equals(expected, ignoreCase = true)) return true
        }
        return false
    }
}
