// Rumus KPI di Home, satu baris per rumus. Tampil saat tile disorot.
// Kunci = nilai data-info pada tile (label tile, atau kunci khusus untuk judul grafik).
import { USD_TO_IDR } from './chat-models.js';
import { fmtInt } from '../utils/format.js';

const OCCUPANCY = 'Okupansi = kendaraan di dalam ÷ kapasitas × 100%';

export function kpiFormula(key, { tariff }) {
  const cost = `Biaya = (token masuk × harga masuk + token keluar × harga keluar) ÷ 1 juta × Rp ${fmtInt(USD_TO_IDR)}`;
  return {
    alerts: ['Total = jumlah kritis + jumlah perhatian'],
    'Perangkat online': ['Perangkat terhubung / total perangkat IoT'],
    'Kestabilan perangkat': ['100% − total waktu terputus ÷ (jumlah perangkat × lama periode)'],
    'Lampu menyala': ['Lampu menyala dan online / total lampu IoT'],
    'Jumlah ruangan terisi': ['Ruang kerja terdeteksi ada orang / total ruang kerja bersensor'],
    energy: ['kWh = jumlah kWh per jam selama periode', `Biaya = kWh × Rp ${fmtInt(tariff ?? 0)}`],
    'Ruang Parkir Tersedia': ['Tersedia = kapasitas − kendaraan di dalam', '% terisi = kendaraan di dalam ÷ kapasitas × 100%'],
    'Rata-rata lama parkir': ['Total lama parkir kendaraan keluar ÷ jumlah kendaraan keluar'],
    'Kendaraan masuk': ['Jumlah nomor polisi terbaca masuk di gerbang selama periode'],
    'Kendaraan keluar': ['Jumlah nomor polisi terbaca keluar di gerbang selama periode'],
    occupancy: [OCCUPANCY, 'Rentang hari: okupansi tertinggi dan rata-rata per hari'],
    'Ulasan sesuai': ['Ulasan sesuai ÷ (ulasan sesuai + ulasan tidak sesuai) × 100%'],
    Pengguna: ['Jumlah pengguna berbeda yang bertanya selama periode'],
    'Total pertanyaan': ['Jumlah pertanyaan selama periode'],
    tokens: ['Token = token masuk + token keluar', cost],
    models: ['Persentase = token model ÷ total token × 100%', cost],
  }[key];
}
