# Mozole CLI güvenlik regresyon suite'i

Eski `tests/integration/hostile.test.ts` senaryoları burada modül bazında genişletildi.
Vitest'in mevcut `tests/**/*.test.ts` deseni tüm dosyaları keşfeder; ek yapılandırma gerekmez.

| Dosya | Tehdit ve güvenlik beklentisi |
| --- | --- |
| `fs.hostile.test.ts` | Traversal, cihaz adları, kontrol karakterleri, symlink üzerinden yazma, atomik yazım ve izinler |
| `process.hostile.test.ts` | Shell enjeksiyonu, sınırlı çıktı taşması, iptal ve zaman aşımı |
| `git.hostile.test.ts` | Argüman enjeksiyonu, başarısız stage/commit sonrası index bütünlüğü |
| `manager.hostile.test.ts` | Süreç çoğalması, eski süreç olayları, log satırı sınırı ve toplu kapatma |
| `runner.hostile.test.ts` | Gerçek HTTP sunucusunda kodlanmış traversal, bozuk URI, symlink ve hata yanıtıyla bilgi ifşası |
| `qa.hostile.test.ts` | CSS muafiyetlerinin kötüye kullanılması, bozuk kaynaklarla denetim atlatma, sahte HTML landmark'ları, tabnabbing ve breakpoint sınırları |
| `scaffold.hostile.test.ts` | Güvensiz scaffold girdilerinin yan etkisiz reddi ve phase durumu bütünlüğü |
| `php.hostile.test.ts` | Origin/Referer taklidi, HTTP yöntemleri, honeypot, alan türleri, Unicode sınırları, e-posta enjeksiyonu ve eşzamanlı kota |
| `mailer.hostile.test.ts` | Gerçek üretilen mailer'da başlık enjeksiyonu, HTML kaçışları, alıcı doğrulaması ve doğrudan erişim |

## Çalışma sınırları

- Bu değişiklik hazırlanırken testler çalıştırılmadı. Başarılı oldukları iddia edilmez.
- Testler yalnızca geçici dizinlerde veri üretir. Traversal ve symlink hedefleri de aynı geçici test alanındadır.
- HTTP testleri gerçek sunucuyu `127.0.0.1` ve işletim sisteminin ayırdığı portta kullanır. Yalnızca tarayıcı başlatma/provision işlemi mock edilir; tarayıcı indirilmez, ekran görüntüsü alınmaz.
- Git ve sunucu yöneticisi testlerinde dış süreçler mock edilir. Process testleri sınırlandırılmış yerel Node alt süreçleri kullanır.
- PHP testleri PHP 8.1+ gerektirir; eksik runtime sessizce atlanmaz. PHP yoksa kurulum hatası görünür olur.
- PHP istek testleri `$_SERVER` / `$_POST` üzerinden front controller'ı çalıştırır. HTTP CORS başlıkları, gerçek JSON request body aktarımı ve Apache `.htaccess` uygulaması bu harness ile doğrulanmaz.
- Hiçbir test gerçek e-posta göndermez. Mailer testlerinde yalnızca son `mail()` taşıması PHP namespace üzerinden yakalanır.
- Symlink/Unix izin senaryoları Windows'ta açıkça atlanır.

## Kaynak incelemesinde görülen açık beklentiler

Güvenli davranışı talep eden testler, mevcut uygulama zayıfsa normal biçimde başarısız
olmalıdır; `todo`, `skip` veya beklenen başarısızlık işaretiyle gizlenmez.
Kaynak incelemesi aşağıdaki testlerin düzeltme gerektirebileceğini gösteriyor; bunlar
çalıştırılarak doğrulanmış bulgular değildir:

- `writeFiles` üst dizin symlink'inin gerçek hedefini kök dizinle karşılaştırmıyor.
- Statik sunucu symlink hedeflerini kök dizinle karşılaştırmıyor ve dosya okuma hatasının metnini yanıta ekliyor.
- Phase ayrıştırıcısı `00;id` gibi geçerli phase öneki taşıyan bozuk durumu kabul edebiliyor.

Suite güvenlik regresyonlarını yakalamayı amaçlar; tüm saldırı yüzeylerinin güvenli
olduğunu kanıtlamaz. Node backend'in ağ davranışı, gerçek tarayıcı izolasyonu,
işletim sistemi yarış koşulları ve uzun süreli kaynak tüketimi ayrıca ele alınmalıdır.
