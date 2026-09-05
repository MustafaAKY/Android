package com.soleco.panel

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.localbroadcastmanager.content.LocalBroadcastManager

/**
 * WhatsApp açıkken sohbet başlığındaki kişi adı/numarasını okur.
 *
 * NOT: WhatsApp kayıtlı bir kişiyle konuşuyorsan başlıkta isim görünür,
 * numara görünmez (rehberde kayıtlı olduğu için). Kayıtsız numaralarda
 * (e-ticaret sipariş akışında müşterilerin çoğu bu durumda) başlıkta
 * doğrudan telefon numarası yazar — bu servis o durumda otomatik yakalar.
 * Kayıtlı kişilerde ismi paneldeki alana yollar, numarayı elle girersin.
 */
class WhatsAppAccessibilityService : AccessibilityService() {

    companion object {
        const val ACTION_HEADER_TEXT = "com.soleco.panel.HEADER_TEXT"
        const val EXTRA_TEXT = "text"

        // WhatsApp'ın sohbet başlığı / mesaj kutusu görünüm kimlikleri.
        // ÖNEMLİ: Android'de view id'leri APK paketine göre namespace'lenir —
        // yani WhatsApp Business'ta (com.whatsapp.w4b) id "com.whatsapp:id/entry"
        // DEĞİL, "com.whatsapp.w4b:id/entry" olur. İkisini ayrı üretiyoruz,
        // yoksa normal WhatsApp'ta çalışıp Business'ta sessizce hiç bulamaz.
        private val HEADER_ID_SUFFIXES = listOf("conversation_contact_name", "title_tv")
        private val MESSAGE_ID_SUFFIXES = listOf("entry")
        private val WA_PACKAGES = listOf("com.whatsapp", "com.whatsapp.w4b")

        private fun idsFor(pkg: String, suffixes: List<String>) = suffixes.map { "$pkg:id/$it" }

        var instance: WhatsAppAccessibilityService? = null

        /**
         * Aktif WhatsApp mesaj kutusuna metni yazar (göndermez — sen kontrol edip
         * gönder tuşuna basarsın). Servis çalışmıyorsa false döner.
         */
        fun insertMessageText(text: String): Boolean {
            val svc = instance ?: return false
            val root = svc.findWhatsAppRoot() ?: return false
            val pkg = root.packageName?.toString() ?: return false
            for (id in idsFor(pkg, MESSAGE_ID_SUFFIXES)) {
                val node = root.findAccessibilityNodeInfosByViewId(id)?.firstOrNull() ?: continue
                val args = Bundle().apply {
                    putCharSequence(
                        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text
                    )
                }
                return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            }
            return false
        }
    }

    override fun onServiceConnected() {
        instance = this
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
    }

    private var lastProcessedAt = 0L

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        try {
            val pkg = event?.packageName?.toString() ?: return
            if (pkg !in WA_PACKAGES) return

            // WhatsApp, sohbet ekranında (kaydırma, yazma, mesaj gelmesi vb.)
            // saniyede onlarca "content changed" olayı fırlatabiliyor. Her birinde
            // pencere ağacını taramak (özellikle panel açıkken TÜM pencereleri
            // tarayan yol) servisi tıkayıp Android'in "erişilebilirlik hizmeti
            // yanıt vermiyor" uyarısını tetikleyebiliyor — kapatıp açınca
            // düzelmesinin sebebi muhtemelen buydu. Başlık metni zaten çok sık
            // değişmediği için, gerçek pencere geçişleri hariç en fazla 400ms'de
            // bir işliyoruz.
            val now = System.currentTimeMillis()
            val isWindowSwitch = event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            if (!isWindowSwitch && now - lastProcessedAt < 400L) return
            lastProcessedAt = now

            val root = findWhatsAppRoot() ?: return
            val headerText = findHeaderText(root)
            if (!headerText.isNullOrBlank()) {
                LocalBroadcastManager.getInstance(this).sendBroadcast(
                    Intent(ACTION_HEADER_TEXT).putExtra(EXTRA_TEXT, headerText)
                )
            }
        } catch (e: Exception) {
            // Hiçbir durumda bu callback'i patlatmıyoruz — bir istisna sistemi
            // servisi "bozuk" olarak işaretleyip kapatıp-açmadan düzelmeyen bir
            // duruma sokabiliyordu.
        }
    }

    /**
     * SOLE&CO paneli ekranda açıkken (kendi WebView overlay penceremiz dokunuşu
     * aldığı için) rootInActiveWindow artık WhatsApp'ı değil, bizim panelimizi
     * gösterebiliyor — bu da "WA'ya Yaz" ve otomatik numara algılamanın panel
     * açıkken çalışmamasına yol açıyordu. Bunun yerine ekrandaki TÜM pencereleri
     * tarayıp içlerinden WhatsApp'a (normal ya da Business) ait olanı buluyoruz.
     */
    private fun findWhatsAppRoot(): AccessibilityNodeInfo? {
        try { rootInActiveWindow?.let { if (isWhatsAppNode(it)) return it } } catch (e: Exception) { }
        val wins = try { windows } catch (e: Exception) { null } ?: return null
        for (w in wins) {
            val r = try { w.root } catch (e: Exception) { null } ?: continue
            if (isWhatsAppNode(r)) return r
        }
        return null
    }

    private fun isWhatsAppNode(node: AccessibilityNodeInfo): Boolean {
        val pkg = try { node.packageName?.toString() } catch (e: Exception) { null } ?: return false
        return pkg in WA_PACKAGES
    }

    private fun findHeaderText(root: AccessibilityNodeInfo): String? {
        val pkg = try { root.packageName?.toString() } catch (e: Exception) { null } ?: return null
        for (id in idsFor(pkg, HEADER_ID_SUFFIXES)) {
            val nodes = try { root.findAccessibilityNodeInfosByViewId(id) } catch (e: Exception) { null }
            val text = nodes?.firstOrNull()?.text?.toString()
            if (!text.isNullOrBlank()) return text
        }
        return null
    }

    override fun onInterrupt() {}
}
