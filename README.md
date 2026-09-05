# SOLE&CO Panel — Android (Baloncuk sürümü)

Chrome eklentindeki `sidepanel.js/css/html` mantığının Android'e taşınmış hali.
Ekranın üstünde yüzen bir baloncuk → tıklayınca aynı panel WebView içinde açılır.

## Nasıl çalışıyor

1. **WhatsAppAccessibilityService** — WhatsApp açıkken sohbet başlığındaki
   metni okur (kayıtsız numaralarda numara, kayıtlı kişilerde isim görünür).
   Yakaladığı metni `LocalBroadcastManager` ile yayınlar.
2. **OverlayService** — Ekranda yüzen baloncuğu ve tıklanınca açılan
   WebView panelini yönetir. Broadcast'i dinler, paneldeki
   `window.AndroidOnHeaderText()` fonksiyonunu çağırarak numarayı otomatik
   doldurur.
3. **assets/panel/** — Eklentindeki `sidepanel.html/css/js` neredeyse
   birebir aynı; sadece Chrome API çağrıları (`chrome.tabs`,
   `chrome.scripting`, `chrome.runtime.sendMessage`, `navigator.clipboard`)
   `window.AndroidBridge` köprüsüyle değiştirildi:
   - `AndroidBridge.copyText(text)` → panoya kopyalar
   - `AndroidBridge.insertToWhatsApp(text)` → aktif WhatsApp mesaj kutusuna
     doğrudan yazar (göndermez, sen kontrol edip gönder tuşuna basarsın)
   - `AndroidBridge.fetchCargo(phone)` → Yeşilkar Kargo API'sini native
     tarafta çağırır (background.js'teki HTTP-proxy mantığının aynısı,
     çünkü WebView de HTTPS bağlamından HTTP'ye karışık içerik olarak bakar)
   - Supabase sorguları (`fetchOrders`, onayla/iptal) değişmeden kaldı —
     doğrudan HTTPS fetch, CORS sorunu yok.

## Kurulum (Android Studio)

1. Bu klasörü Android Studio'da "Open" ile aç, Gradle sync'i bekle.
2. Bir telefona/emülatöre kur ve çalıştır.
3. Açılan ekranda sırasıyla:
   - **"Üstte gösterme izni ver"** → izni aç
   - **"Erişilebilirlik servisini aç"** → ayarlarda "SOLE&CO Panel" servisini bul, aç
     (Android bu tür servisler için bir uyarı ekranı gösterir — kendi
     yazdığın kişisel bir araç olduğu için normal)
   - **"Baloncuğu Başlat"** → yeşil baloncuk ekranda belirir
4. WhatsApp'ı aç, bir sohbete gir, baloncuğa dokun → panel açılır,
   numara otomatik gelmişse dolu gelir, gelmemişse elle yazarsın.

### "Kısıtlanmış ayar — bu ayar şu anda kullanılamıyor" hatası

Android 13+ (çoğu Xiaomi/MIUI dahil), Play Store dışından (sideload)
kurulan uygulamalarda Erişilebilirlik ve Bildirim erişimi gibi izinleri
kötüye kullanılabilecek malware'lere karşı **varsayılan olarak kilitler**.
Bunu açman gerekiyor:

1. Ayarlar → Uygulamalar → **Tüm uygulamalar** → **SOLE&CO Panel**'i bul, gir.
2. Sağ üstteki **⋮ (üç nokta)** menüsüne dokun.
3. **"Kısıtlanmış ayarlara izin ver"** seçeneğine dokun (parmak izi/PIN
   isteyebilir).
4. Şimdi Ayarlar → Erişilebilirlik'e git, SOLE&CO Panel'i normal şekilde
   açabilmen lazım.

## Bilinen sınırlar / dikkat edilmesi gerekenler

- **Kayıtlı kişiler**: Rehbere kayıtlı bir numarayla konuşuyorsan başlıkta
  sadece isim görünür, numara görünmez — bu Android'in/WhatsApp'ın
  davranışı, aşılamaz. Sipariş akışında müşterilerin çoğu kayıtsız
  olduğundan pratikte sorun çıkarmaz.
- **View ID'leri** (`com.whatsapp:id/conversation_contact_name`,
  `com.whatsapp:id/entry`) WhatsApp güncellemeleriyle değişebilir. Bir
  güncelleme sonrası otomatik algılama durursa bu ID'leri
  `WhatsAppAccessibilityService.kt` içinde güncellemek gerekir
  (Android Studio'nun Layout Inspector'ı ile yeni ID'yi bulabilirsin).
- **Play Store'a yüklemiyoruz** — bu kişisel/iç kullanım için bir araç.
  Erişilebilirlik servisi kullanan uygulamaların mağaza politikası daha
  sıkı; sideload (APK'yı doğrudan kurma) için bu bir sorun değil.
- İkonlar placeholder — `res/mipmap-*/ic_launcher.png` dosyalarını
  istediğin görselle değiştirebilirsin.
