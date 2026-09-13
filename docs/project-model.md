# MozoleCLI proje modeli

MozoleStudio için Vite + React + Tailwind tabanlı üretim şablonları oluşturur.

- **Standard:** React Router ile statik ön üretim. Vcard, landing, restoran ve QR menü gibi sektör projelerinin temeli.
- **Flagship:** Wouter, Motion ve Lenis. Header, Footer, sayfalar, CanvasLayer, Reveal ve useSmoothScroll ayrı proje dosyalarıdır.
- **Backend:** Profil seçiminden bağımsız, isteğe bağlı PHP veya Node API altyapısı. Varsayılan `none`.

## Komutlar

```sh
mozole new restoran
mozole new vitrin --flagship
mozole new restoran --backend php
mozole backend node --path ./mevcut-proje
mozole adopt ./mevcut-proje
mozole adopt ./mevcut-proje --flagship --backend php
```

Backend açık projede `npm run dev:backend` ve `npm run dev` ayrı terminallerde çalışır.
Vite `/api` isteklerini yerel backend'e iletir. Üretim ortamında aynı yolun PHP/Node
servisine yönlendirilmesi gerekir. PHP iletişim işlevi sunucu mail transportu ve müşteri
ayarlarını gerektirir. Node iletişim endpoint'i teslimat/depolama adaptörü eklenene kadar
501 döndürür; sahte başarılı gönderim yanıtı üretmez. Müşteriye özel menü yönetimi için
oturum, yetkilendirme, veri saklama ve panel ekranları proje içerisinde geliştirilir.

## Projeye ait kütüphane

`src/library/index.ts` proje kütüphanesinin girişidir:

- `src/components/ui`: Radix Slot tabanlı Button, Input ve Radix Dialog bileşenleri.
- `src/components/layout`: Header, Footer, Container.
- `src/components/motion`: Flagship Reveal ve projeye özel animasyonlar.
- `src/behaviors`: Flagship useSmoothScroll ve projeye özel davranışlar.
- `src/styles/tokens.css`: projeye ait Tailwind tasarım tokenları.

Her modül kendi klasöründeki `index.ts` üzerinden export edilir. İş mantığı sayfa ve
özellik modüllerinde tutulur. Yeni bileşenler projede tasarlanır; farklı projelerden ortak
UI veya token import edilmez. Hareket modülleri azaltılmış hareket tercihini gözetir.

## Prototip klasörü

```sh
mkdir prototipler
cd prototipler
mozole prototype init
npm install
mozole new musteri-a
mozole new musteri-b --flagship
npm install
npm run dev --workspace projects/musteri-a
npm run build --workspace projects/musteri-b
```

Kök `package.json`, npm workspaces ve iki profilin ortak bağımlılık havuzunu içerir.
Kurulum yalnızca kökte yapılır. Yeni proje ekledikten sonraki kök kurulum workspace
bağlantılarını günceller; bağımlılıkları her projeye yeniden kurmaz. Her proje kendi
manifestini taşır, böylece klasörü dışarı kopyalandığında bağımsız kurulabilir.
Uyumsuz bağımlılık sürümleri npm tarafından iç içe kurulabilir; sürümleri aynı tutun.
Eski `prototype init` çıktısı komut tekrar çalıştırıldığında workspace yapısına yükseltilir.
Prototip içerisinde yeni projeler için ayrı Git deposu oluşturulmaz.

## Adopt kapsamı

Vite + React projelerine eksik bağımlılıklar, tokenlar, yerel bileşenler, export girişleri,
Mozole metadata, geliştirme politikaları ve belgeler eklenir. Boş klasöre tam Standard
veya Flagship şablonu eklenebilir. Başka frameworkler otomatik olarak dönüştürülmez.

Mevcut kaynaklar, scriptler ve bağımlılık sürümleri korunur. Eksik Tailwind entegrasyonu
mevcut Vite konfigürasyonunu import eden ek bir config ile bağlanır. Bilinen giriş
dosyasına token CSS importu eklenir. Korunan component dosyaları için öneriler
`.mozole/adoption-proposals/` içerisinde tutulur. Eski sayfaların yeni bileşenlere
bağlanması ve sürüm çatışmaları `.mozole/adoption-report.md` içinde listelenir.
İnceleme bekleyen dönüşümler metadata içerisinde `review-required` olarak işaretlenir.

Vite config seçimi React Router'ın [CLI config seçeneğini](https://reactrouter.com/api/other-api/dev)
kullanır.

## Çalıştırılmamış doğrulama komutları

CLI deposunda:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Üretilen projede bağımlılık kurulumu sonrasında:

```sh
npm run typecheck
npm run build
mozole verify
```

## Konuşmayla yönlendirilen üretim

Yeni projeler `docs/workflow.md`, `docs/toolkit.md` ve `docs/decisions.md` ile gelir.
Tasarım yönü önce güncel kullanıcı mesajından, sonra konuşmada kesinleşmiş kararlardan
alınır. `design.md` ve Stitch/Superdesign çıktıları yalnızca referanstır. Varsayılan
şablon stili, Header/Footer veya örnek sayfalar onaylanmış müşteri tasarımı sayılmaz.

Bağımsız primitive ayrı dosyadadır; Dialog gibi tek primitive'in ilişkili alt parçaları
aynı dosyada kalabilir. Primitive → bileşik bileşen → section → sayfa sırası izlenir.
`src/components/features/` ve `src/components/sections/` yerel export girişleriyle gelir.
Agent yalnızca konuşmada yetkilendirilmiş aşamaları tamamlar; birden fazla aşama için
verilmiş yönlendirme tekrar onay gerektirmez. `/ui` galerisi ancak istendiğinde oluşturulur.

Agent kendi kendine görsel inceleme, screenshot veya referans görsellerini karşılaştırma
yapmaz. Kullanıcının sağladığı ekran görüntüsünü yalnızca istenen düzeltme için kullanır.
Düzeltme, hatanın sahibi olan primitive/layout/behavior/section veya token üzerinde yapılır.
Teknik kontroller görsel onay yerine geçmez. Test yapılmaması istendiğinde komutlar verilir.

Karar belgesi başlangıçta boştur; yalnızca konuşmada kesinleşen kararlar kaydedilir.
Varsayımlar ve açık sorular ayrı tutulur. Adopt mevcut kararları/referansları korur,
eksik rehberleri ekler ve mevcut agent talimatlarına workflow bağlantısı ekler.
Kurallar agent sözleşmesidir; her bileşenin dosya sınırını denetleyen yeni bir otomatik
test mekanizması eklenmemiştir.

## Ek araçlar

```sh
mozole add --list
mozole add accordion,sheet,drawer
mozole add all
mozole assets --input assets/images --output public/media
mozole assets --widths 320,640,1280,1920,3840 --base /client/
mozole release
mozole release --format zip --output releases/v1
mozole release --format directory --output releases/v1
mozole release --skip-build --from build/client
```

`add` proje içi Radix/HTML temellerini ayrı dosyalara ekler; mevcut dosyaları korur.
Bağımlılık kayıtlarını ekledikten sonra kurulumu kullanıcı kökte yapar. `all` tüm kataloğu
seçer; katalog accordion, sheet, drawer, menüler, seçim kontrolleri, formlar, tablolar ve
bildirim temellerini kapsar. Drawer drag hareketi içermeyen erişilebilir alt paneldir.

`assets` Sharp ile orijinalleri koruyarak WebP/AVIF genişlik varyantları, JPEG/PNG fallback,
manifest ve yerel ResponsiveImage üretir. Varsayılan genişlikler 320–3840px aralığındadır;
küçük kaynaklar büyütülmez. Animasyonlu görseller atlanarak raporlanır. Görsel inceleme yapmaz.

`release` build sonrasında statik HTML ve isteğe bağlı PHP API'yi `release/` ve `release.zip`
içerisinde birleştirir. Kaynak kod deposunu veya Node API'yi dağıtmaz. FTP/rsync ile aktarılacak
içerik kökten hazırdır; komut yükleme yapmaz. Sunucudaki PHP/mail ayarları ayrıca yapılandırılır.
Mevcut release ezilmez; yeni isim seçilir. Manifestte dışlanan dosyalar ve SHA-256 kayıtları bulunur.

Üç araç TUI `[6] TOOLS` sekmesindedir. Projelere `docs/tools.md` rehberi eklenir.
CLI Sharp nedeniyle Node.js 20.9+ gerektirir. Bu değişiklikler için test çalıştırılmamıştır.
