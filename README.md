# SatuData Pusdatin — Smart Building Dashboard

Dashboard monitoring Gedung Pusdatin: **IoT bangunan cerdas**, **chatbot AI**, dan **computer vision parkir**.
Dibangun dengan HTML, Tailwind CSS v4, dan JavaScript (ES modules), dijalankan dengan Vite.
Denah lantai dan peta parkir tampil dalam 3D (Three.js) dengan opsi beralih ke 2D (SVG).
Tema visual mengikuti [`design.md`](design.md).

| Menu | Halaman | Isi |
|------|---------|-----|
| Home | `index.html` | KPI dan grafik dari tiga menu: IoT (perangkat, uptime, peringatan, Telegram, listrik), AI Vision (slot, okupansi, kendaraan masuk/keluar, lama parkir), Chatbot (pengguna, pertanyaan, token, biaya, penilaian jawaban) |
| IoT | `iot.html` | Denah 3D/2D per lantai, detail ruang, kontrol perangkat, peringatan + notifikasi Telegram, riwayat status perangkat dan uptime, listrik |
| Chatbot | `chatbot.html` | Chatbot TEJAS (pintas unit PU, SITABA, rujukan dokumen, analisis lampiran, grafik, penilaian jawaban) dan tab Analitik (tren pertanyaan/token/biaya, pengguna, riwayat chat) |
| AI Vision | `vision.html` | Peta parkir 3D/2D, kamera + bounding box, okupansi per jam dan 7 hari, riwayat ALPR, riwayat kendaraan (jam masuk/keluar, lama parkir) |

Ruang lingkup mengikuti paparan *Sistem Informasi Kecerdasan Buatan* (Pusdatin Kementerian PU):
Dashboard Monitoring IoT, Dashboard AI Vision, dan Dashboard Chatbot. SSO masih dalam kajian, jadi
analitik mencatat pertanyaan dari dashboard atas nama satu pengguna (`CURRENT_USER` di `src/js/data/mock-chat.js`).

## Menjalankan

```bash
npm install
cp .env.example .env     # opsional, default sudah mode mock
npm run dev              # http://localhost:5173
npm run build            # hasil di dist/
npm run preview          # cek hasil build
```

Tanpa backend, dashboard berjalan dengan **data simulasi** (`VITE_USE_MOCK=true`): status perangkat, suhu,
dan parkir berubah tiap 5 detik, dan aksi seperti "matikan lampu" benar-benar mengubah state mock
(tersimpan di `sessionStorage` per tab).

Kontrol tampilan 3D: seret untuk memutar, klik kanan + seret untuk menggeser, `⌘/Ctrl` + scroll
(atau pinch trackpad) untuk zoom. Tombol di pojok kanan: perbesar, perkecil, tampak atas, reset.
Pilihan 3D/2D disimpan per browser.

## Struktur

```
index.html, iot.html, chatbot.html, vision.html   # satu file per menu
public/                                           # aset statis (favicon)
src/
  styles/main.css          # Tailwind + token desain (@theme) + kelas komponen (.card, .btn, .badge, ...)
  js/
    config.js              # baca variabel .env
    pages/                 # entry script per halaman
    components/            # layout, denah 2D, peta parkir 2D, grafik tren (trend-chart.js), chat, kamera, ui kecil
      three/               # scene 3D bersama, denah lantai 3D, peta parkir 3D (Three.js)
    services/
      api.js               # SATU-SATUNYA pintu data (mock atau HTTP/WebSocket)
      mock-backend.js      # backend palsu di browser
      chat-engine.js       # chatbot rule-based untuk mode mock
      selectors.js         # agregasi: ringkasan, peringatan, ruang boros, dll.
    data/
      mock.js              # generator data simulasi (= contoh bentuk data dari backend)
      device-types.js      # metadata tipe perangkat & kendaraan
    utils/                 # format angka/waktu, helper DOM
```

Aturan utama: halaman dan komponen **tidak pernah memanggil `fetch` langsung**; semua lewat `api` di
`src/js/services/api.js`. Pindah ke backend asli cukup dengan `VITE_USE_MOCK=false`.

## Variabel lingkungan

| Variabel | Default | Keterangan |
|----------|---------|------------|
| `VITE_USE_MOCK` | `true` | `false` untuk memakai backend |
| `VITE_API_BASE_URL` | `/api` | Base URL REST API |
| `VITE_WS_URL` | kosong | URL WebSocket realtime. Kosong berarti polling |
| `VITE_POLL_INTERVAL` | `5000` | Interval polling / simulasi (ms) |

Untuk menghindari CORS saat development, aktifkan `server.proxy` di `vite.config.js`.

## Kontrak API

Bentuk JSON persis sama dengan objek yang dibuat `src/js/data/mock.js`. Semua waktu dalam ISO 8601.

### `GET /iot`

```jsonc
{
  "building": {
    "id": "pusdatin",
    "name": "Gedung Pusdatin",
    "floors": [{
      "id": "L1", "level": 1, "name": "Lantai 1", "short": "Lt 1", "label": "Ruang Katim, rapat & layanan",
      "rooms": [{
        "id": "L1-R01", "floorId": "L1", "name": "20 R. Jafung Madya",
        "type": "office",           // office | meeting | lobby | hall | storage | pantry | toilet | core | corridor
        "equipped": true,           // false = "Sensor belum terpasang", tanpa perangkat
        "x": 20, "y": 20, "w": 110, "h": 230,   // posisi di denah, viewBox 1000 x 560
        "capacity": 4, "occupancy": 2,          // dari sensor kehadiran; null bila belum terpasang
        "temperature": 24.1, "humidity": 58     // dari sensor suhu (remote IR); null bila tidak ada
      }]
    }]
  },
  "devices": [{
    "id": "L1-R01-LMP1", "type": "light",     // light | ac | sensor (remote IR + suhu) | presence (sensor kehadiran)
    "name": "Lampu 1", "floorId": "L1", "roomId": "L1-R01",
    "x": 120, "y": 90,                         // posisi marker di denah
    "on": true,                                // lampu/AC menyala, sensor aktif, sensor kehadiran mendeteksi orang
    "online": true,
    "lastSeen": "2026-10-05T03:00:00.000Z"
  }],
  "activity": [{                               // riwayat aktivitas per ruang, terbaru di depan
    "id": "ACT-1", "time": "2026-10-05T01:12:00.000Z", "roomId": "L1-R01", "floorId": "L1", "text": "Lampu 1 dinyalakan"
  }],
  "energy": {                                  // meter listrik per lantai (kWh), seperti panel ICC
    "tariff": 1727,                            // Rp per kWh
    "date": "2026-10-05",
    "floors": {
      "L1": {
        "peakKw": 14.4,
        "today": [3.9, 4.0, null],             // 24 nilai per jam; null = jam belum lewat
        "yesterday": [4.1, 3.8],               // 24 nilai
        "target": [3.7, 3.5],                  // 24 nilai, batas pemakaian per jam
        "week": [184.3, 69.8, null],           // Senin..Minggu minggu ini
        "lastWeek": [190.2],                   // 7 nilai
        "month": [175.1, null],                // per tanggal bulan ini
        "lastMonth": [180.4]                   // per tanggal bulan lalu
      }
    },
    "panels": [{                               // meter di panel distribusi
      "id": "TRAFO", "name": "Trafo induk", "meter": "PU 6 · Kelistrikan 1", "source": true,
      "voltage": 404.7, "current": 35.8, "pf": 0.9, "kw": 22.6, "kwhToday": 128.5, "online": true
    }, {
      "id": "OUT-L1", "name": "Output Lantai 1", "meter": "PU 3 · Kelistrikan 1", "floorId": "L1",
      "voltage": 404.4, "current": 18.4, "pf": 0.89, "kw": 11.5, "kwhToday": 69.8, "online": true
    }],
    "updatedAt": "2026-10-05T03:00:00.000Z"
  },
  "updatedAt": "2026-10-05T03:00:00.000Z"
}
```

Ruang, jenis perangkat, dan meter listrik mengikuti kondisi gedung di Sinatra (BGC dan ICC).
Angkanya simulasi. Ringkasan listrik, peringkat ruang, dan pemakaian per ruang dihitung di
`src/js/services/selectors.js` dari objek `energy` ini.

Koordinat denah bisa digambar sekali (dari CAD/denah asli) lalu disimpan di database.

### `PATCH /iot/devices`

Request `{ "ids": ["L1-R01-LMP1"], "on": false }`, response `{ "updated": 1 }`.

### `GET /parking`

```jsonc
{
  "zones": [{
    "id": "A", "name": "Area A", "location": "Basement", "kind": "car",  // car | motorcycle
    "rows": 2, "cols": 16,
    "slots": [{ "id": "A-01", "reserved": "disabilitas", "occupied": true,
                "vehicleType": "car", "plate": "B 1234 ABC", "since": "..." }]
  }],
  "cameras": [{
    "id": "CAM-02", "name": "Area A · Basement", "zoneId": "A", "online": true,
    "streamUrl": null,   // isi URL MJPEG/snapshot agar gambar kamera asli tampil
    "detections": [{ "label": "mobil", "confidence": 0.94, "slotId": "A-03", "box": [4, 30, 19, 26] }]  // box: x,y,w,h dalam % frame
  }],
  "events": [{ "id": "EV-1", "time": "...", "gate": "Gerbang 1", "direction": "in",
               "vehicleType": "car", "plate": "B 1234 ABC", "confidence": 0.97 }],
  "history": [{ "hour": "06:00", "occupancy": 0.08 }],
  "today": { "in": { "car": 148, "motorcycle": 263, "truck": 6 }, "out": { "car": 97, "motorcycle": 171, "truck": 4 } },
  "updatedAt": "..."
}
```

### `GET /iot/history`

Riwayat 7 hari. Uptime per hari dan per perangkat dihitung di `deviceUptime()` (`selectors.js`).

```jsonc
{
  "statusLog": [{ "id": "ST-1", "time": "...", "deviceId": "L1-R01-LMP1", "floorId": "L1", "roomId": "L1-R01", "type": "light", "on": true }],
  "outages": [{ "id": "OUT-1", "deviceId": "L1-R03-LMP1", "floorId": "L1", "roomId": "L1-R03", "type": "light",
                "start": "...", "end": null }],   // end null = masih terputus
  "windowDays": 7,
  "updatedAt": "..."
}
```

### `GET /notifications`, `PATCH /notifications/settings`, `POST /notifications/test`

Log pesan peringatan ke Telegram. Backend mengirim lewat Telegram Bot API (`sendMessage`) setiap ada
peringatan baru dari aturan yang sama dengan `getAlerts()`, dan pesan "pulih" saat peringatan hilang.

```jsonc
{
  "channel": { "type": "telegram", "bot": "@pusdatin_iot_bot", "chat": "Grup Teknisi Pusdatin", "connected": true },
  "settings": { "enabled": true, "critical": true, "warning": true },   // PATCH menerima sebagian field ini
  "items": [{ "id": "TG-1", "time": "...", "kind": "alert", "severity": "critical",   // kind: alert | resolved | test
              "title": "Lampu offline", "meta": "Lantai 1 · 22 R. Katim", "text": "...", "status": "sent" }]  // sent | skipped | failed
}
```

`GET /parking` juga memuat `visits` (satu baris per kendaraan: `plate`, `inAt`, `outAt`, `gateIn`, `gateOut`,
`zoneId`, `slotId`, `confidence`; `outAt` null = masih parkir) dan `historyWeek` (`[{ date, avg, peak }]`, 7 hari).

### `POST /chat`

Request:

```jsonc
{
  "message": "lampu yang belum mati?",
  "history": [{ "role": "user", "text": "..." }],
  "unit": "pusdatin",          // pintas unit: pusdatin | sekjen | sda | bina-marga | cipta-karya | prasarana-strategis | pembiayaan | bpsdm
  "model": "GPT-4o Mini",      // pilihan model di kotak tanya
  "attachment": { "name": "SOP.pdf", "size": 120400, "type": "application/pdf" }   // opsional
}
```

`unit` selain `pusdatin` dan `attachment` diarahkan ke basis dokumen TEJAS. Saat ini dashboard hanya
mengirim metadata lampiran; unggah isi file perlu endpoint terpisah (mis. `POST /chat/files`).
Riwayat percakapan disimpan di browser (`src/js/services/chat-store.js`, localStorage) dan bisa
dipindah ke backend dengan fungsi yang sama.

Response:

```jsonc
{
  "text": "Ada 117 lampu yang masih menyala ...",
  "items": [{ "title": "Lantai 1 · Lobby", "meta": "6 lampu menyala" }],          // opsional
  "actions": [{ "label": "Matikan 117 lampu", "variant": "primary",                // opsional
                "action": { "type": "setDevices", "ids": ["..."], "on": false } }],
  "suggestions": ["Ruang kosong tapi lampu masih menyala?"],                        // opsional
  "link": { "label": "Lihat peta parkir", "href": "/vision.html" }                  // opsional
}
```

Response juga boleh memuat `citations` (`[{ n, title, ref, snippet }]`, ditampilkan sebagai rujukan bernomor),
`chart` (lihat komentar di `chat-engine.js`), `model`, dan `usage` (`{ inputTokens, outputTokens }`).
Untuk lampiran teks (.txt/.md/.csv) dashboard mengirim isinya di `attachment.text` (maks. 20.000 karakter).

`POST /chat/feedback` menerima `{ messageId, rating: "up" | "down" | null, previous, model, question, answer }`.
`POST /chat` juga mengirim `messageId` (id jawaban yang akan datang) supaya penilaian bisa dicocokkan ke riwayat.
`GET /chat/analytics` mengembalikan `users` (nama, unit, `lastLogin`, `questions`, `ratings`), `daily` (30 hari,
pertanyaan dan token per model), dan `history` (riwayat chat semua pengguna: `question`, `answer`, `model`,
`inputTokens`, `outputTokens`, `rating`). Biaya dihitung di dashboard dari harga acuan di
`src/js/data/chat-models.js`.

`actions` selalu dikonfirmasi user lewat tombol sebelum dijalankan. Backend LLM sebaiknya memakai
tool/function calling ke data `/iot` dan `/parking`, lalu mengembalikan bentuk respons di atas.
`chat-engine.js` bisa dipakai sebagai acuan intent yang perlu didukung.

### Realtime (opsional)

Jika `VITE_WS_URL` diisi, server mengirim pesan JSON `{ "iot": {...} }` dan/atau `{ "parking": {...} }`
dengan bentuk yang sama seperti endpoint GET. Tanpa WebSocket, dashboard melakukan polling.

## Menambah sesuatu

- **Tipe perangkat baru:** tambah di `DEVICE_TYPES` (`data/device-types.js`), bentuk marker 2D di
  `markerShape()` (`components/floor-plan.js`), serta geometri & tinggi 3D di `geo` / `DEVICE_Y`
  (`components/three/floor-plan-3d.js`).
- **Ikon baru:** import dari `lucide` di `components/icons.js`, lalu pakai `<i data-lucide="nama-ikon">`.
- **Intent chatbot baru (mode mock):** tambah fungsi intent di `services/chat-engine.js` dan
  daftarkan di `answer()`.
- **Halaman baru:** buat `nama.html` (salin kerangka halaman lain), entry `src/js/pages/nama.js`,
  daftarkan di `vite.config.js` (`build.rollupOptions.input`) dan menu `NAV` di `components/layout.js`.
