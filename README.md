# Sistem Monitoring SPPG

Prototipe dashboard suhu dan kelembapan dengan frontend, backend Node.js, dan pengiriman pembacaan sensor dari ESP32 melalui HTTP.

## Menjalankan dashboard

Pastikan Node.js sudah terpasang. Backend telah dikonfigurasi untuk mode `live`. Buka dua terminal pada folder proyek:

1. Backend: `npm run backend`
2. Frontend: `npm run frontend`

Buka [http://localhost:5173](http://localhost:5173). Untuk memakai simulasi tanpa perangkat, ubah `DATA_MODE=simulation` di `backend/.env`, lalu mulai ulang backend. Pembacaan simulasi tidak disimpan ke riwayat perangkat.

## Menghubungkan ESP32 dan DHT11

Alur data: **DHT11 → ESP32 → Wi-Fi lokal → backend Node.js → `backend/data/readings.json` → dashboard**.

### 1. Siapkan backend

Konfigurasi lokal `backend/.env` berisi mode `live`, host LAN, dan API key acak yang cocok dengan firmware di `firmware/esp32_dht11/src/secrets.h`. Kedua file rahasia tersebut diabaikan Git. Jangan bagikan atau commit file-file itu. Jalankan backend dari folder proyek:

```powershell
npm run backend
```

Cari alamat IPv4 komputer server dengan `ipconfig`. Komputer server dan ESP32 harus berada di jaringan lokal yang sama. Izinkan koneksi masuk ke port `3000` pada Windows Firewall hanya untuk jaringan privat yang dipercaya. Pastikan router tidak meneruskan port tersebut ke internet.

Endpoint penerimaan data akan menolak kiriman jika API key di firmware tidak cocok dengan `DEVICE_API_KEY` pada `backend/.env`. Mode `live` tidak menampilkan atau mencampur data simulasi; sebelum pembacaan pertama masuk, dashboard akan menunjukkan bahwa data sedang ditunggu.

### 2. Siapkan dan unggah program ESP32

Proyek firmware PlatformIO tersedia di [firmware/esp32_dht11](./firmware/esp32_dht11). Program mengirim suhu dan kelembapan setiap 30 detik ke backend.

1. Pasang extension **PlatformIO IDE** di VS Code, lalu buka folder `firmware/esp32_dht11` sebagai proyek PlatformIO. Konfigurasi board saat ini adalah `esp32dev`; ubah `board` pada `platformio.ini` jika board yang dipakai berbeda.
2. Hubungkan DHT11: VCC ke 3.3V, GND ke GND, dan DATA ke GPIO 4 (atau sesuaikan `DHT_PIN` di `src/main.cpp`). Untuk sensor DHT11 bare, gunakan resistor pull-up 10 kΩ antara DATA dan VCC bila modul tidak memilikinya.
3. Buat atau isi `src/secrets.h` lokal (file ini diabaikan Git) dengan konfigurasi Wi-Fi dan API key:
   ```cpp
   #pragma once

   constexpr char WIFI_SSID[] = "nama-wifi";
   constexpr char WIFI_PASSWORD[] = "password-wifi";
   constexpr char DEVICE_API_KEY[] = "samakan-dengan-DEVICE_API_KEY-di-backend";
   ```
   API key firmware harus sama dengan `DEVICE_API_KEY` di `backend/.env`. Isi `API_URL` di `src/main.cpp` dengan alamat IPv4 komputer server, misalnya `http://192.168.1.10:3000/api/monitoring/readings` — jangan gunakan `localhost` karena `localhost` pada ESP32 menunjuk ke ESP32 itu sendiri.
4. Pilih port COM perangkat di PlatformIO, lalu jalankan **Build**, **Upload**, dan **Monitor** dari toolbar PlatformIO. Serial Monitor menggunakan 115200 baud. Respons HTTP `200` berarti backend menerima pembacaan; `401` menunjukkan kunci tidak cocok; `400` menunjukkan format atau nilai sensor ditolak.

Jaga Wi-Fi dan API key tetap privat. Contoh memakai HTTP tanpa enkripsi, sehingga hanya layak untuk jaringan lokal tepercaya; untuk penggunaan di luar jaringan lokal, gunakan HTTPS melalui gateway/reverse proxy dan jangan membuka port backend langsung ke internet.

### Endpoint API

- `GET /api/health` — status backend, mode data, status perangkat, dan waktu pembacaan terakhir.
- `POST /api/monitoring/readings` — menerima JSON dari ESP32 dengan header `X-Device-Key`.
- `GET /api/monitoring/latest` — pembacaan terbaru.
- `GET /api/monitoring/history` — maksimal 500 pembacaan terbaru.
- `GET /api/monitoring/trend?from=YYYY-MM-DD&to=YYYY-MM-DD` — data tren pada rentang tanggal.
- `GET /api/analysis/prediction` — perkiraan suhu dan kelembapan satu jam ke depan dari regresi linear pada pembacaan satu jam terakhir. Perkiraan hanya tersedia jika ada minimal 3 pembacaan dalam rentang minimal 5 menit dan perangkat live sedang online; ini estimasi statistik, bukan model AI. Dalam `DATA_MODE=simulation`, perkiraan dihitung dari data simulasi, bukan sensor nyata.
- Dashboard meminta prediksi baru otomatis setiap 30 detik dan menampilkan waktu pembaruan terakhir.
- `GET /api/settings` dan `PUT /api/settings` — membaca dan menyimpan batas parameter.

Contoh body untuk `POST /api/monitoring/readings`:

```json
{
  "deviceId": "ruang-penyimpanan-1",
  "temperature": 5.2,
  "humidity": 68
}
```

Waktu pembacaan ditetapkan backend saat menerima kiriman agar tidak bergantung pada jam ESP32. Riwayat disimpan di `backend/data/readings.json` dan dibatasi ke 20.000 pembacaan terbaru. Perangkat dianggap offline jika tidak ada data selama 90 detik.

## Konfigurasi

- `DATA_MODE`: `live` pada konfigurasi lokal; ubah ke `simulation` untuk mencoba tanpa ESP32.
- `HOST`: alamat bind backend; bawaan `127.0.0.1`. Gunakan `0.0.0.0` agar ESP32 di LAN dapat menjangkaunya.
- `PORT`: port backend; bawaan `3000`.
- `DEVICE_API_KEY`: kunci acak pada `backend/.env`, wajib cocok dengan kunci firmware.
- `READINGS_FILE`: opsional, lokasi alternatif file penyimpanan riwayat.
- `DEVICE_OFFLINE_AFTER_MS`: opsional, batas waktu status offline; bawaan `90000`.

Sistem masih memerlukan pengujian dengan perangkat dan sensor yang benar-benar digunakan sebelum dipakai operasional. Sketch bawaan ditujukan untuk ESP32 dengan DHT11; sesuaikan tipe sensor dan pin bila perangkat berbeda.
