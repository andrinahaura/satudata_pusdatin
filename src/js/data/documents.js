// Basis dokumen contoh untuk simulasi pencarian dokumen (RAG) di chatbot, dan data kejadian
// bencana contoh dari SITABA. Semua isi di file ini adalah contoh untuk mode simulasi,
// bukan dokumen atau data resmi. Backend asli mengambil potongan dokumen dari indeks vektor
// dan data kejadian dari API SITABA, lalu mengembalikan `citations` dengan bentuk yang sama.

export const DOCUMENTS = [
  {
    id: 'DOC-PSD-01',
    unit: 'pusdatin',
    title: 'SOP Peminjaman Ruang Rapat Gedung Pusdatin (contoh)',
    year: 2025,
    sections: [
      { ref: 'Bagian 2', text: 'Peminjaman ruang rapat diajukan paling lambat satu hari kerja sebelum kegiatan melalui aplikasi layanan internal. Permohonan memuat nama kegiatan, jumlah peserta, waktu mulai, dan waktu selesai.' },
      { ref: 'Bagian 3', text: 'Petugas Tata Usaha memeriksa ketersediaan ruang dan menyetujui permohonan paling lama empat jam kerja. Bila ruang bentrok, pemohon ditawari ruang lain dengan kapasitas yang sesuai.' },
      { ref: 'Bagian 4', text: 'Setelah kegiatan selesai, peminjam mematikan lampu, AC, dan perangkat presentasi. Sistem IoT gedung mematikan perangkat secara otomatis bila ruang kosong lebih dari 30 menit.' },
    ],
  },
  {
    id: 'DOC-PSD-02',
    unit: 'pusdatin',
    title: 'Pedoman Penghematan Energi Gedung Pusdatin (contoh)',
    year: 2025,
    sections: [
      { ref: 'Pasal 3', text: 'Suhu AC di ruang kerja diatur pada 24 sampai 26 derajat Celsius. AC dinyalakan paling cepat pukul 07.30 dan dimatikan paling lambat pukul 17.00 kecuali ada kegiatan lembur yang disetujui.' },
      { ref: 'Pasal 4', text: 'Lampu di ruang yang tidak berpenghuni wajib dimatikan. Koridor menggunakan pencahayaan minimum di luar jam kerja.' },
      { ref: 'Pasal 6', text: 'Pemakaian listrik per lantai dipantau setiap jam. Bila pemakaian melebihi target lebih dari 20 persen, pengelola gedung mendapat notifikasi dan wajib menindaklanjuti dalam satu jam.' },
    ],
  },
  {
    id: 'DOC-PSD-03',
    unit: 'pusdatin',
    title: 'Tata Tertib Parkir Kendaraan Pegawai (contoh)',
    year: 2024,
    sections: [
      { ref: 'Butir 1', text: 'Kendaraan pegawai wajib terdaftar dan nomor polisinya tercatat di sistem pengenalan plat nomor di gerbang masuk.' },
      { ref: 'Butir 2', text: 'Area A basement diprioritaskan untuk kendaraan pimpinan dan penyandang disabilitas. Area motor berada di samping gedung.' },
      { ref: 'Butir 4', text: 'Kendaraan yang menginap lebih dari 24 jam tanpa pemberitahuan dilaporkan ke petugas keamanan.' },
    ],
  },
  {
    id: 'DOC-SKJ-01',
    unit: 'sekjen',
    title: 'Pedoman Tata Naskah Dinas Internal (contoh)',
    year: 2024,
    sections: [
      { ref: 'Bab II', text: 'Naskah dinas internal terdiri atas nota dinas, memorandum, dan surat undangan. Setiap naskah diberi nomor sesuai kode klasifikasi arsip unit kerja.' },
      { ref: 'Bab III', text: 'Nota dinas ditandatangani pejabat paling rendah setingkat eselon III dan ditujukan kepada pejabat setingkat atau satu tingkat di atasnya.' },
    ],
  },
  {
    id: 'DOC-SDA-01',
    unit: 'sda',
    title: 'Petunjuk Teknis Pemeliharaan Saluran Irigasi Tersier (contoh)',
    year: 2023,
    sections: [
      { ref: 'Bagian 1', text: 'Pemeliharaan rutin saluran irigasi tersier meliputi pembersihan sedimen, perbaikan tanggul kecil, dan pengecekan pintu air setiap awal musim tanam.' },
      { ref: 'Bagian 2', text: 'Kerusakan berat pada bangunan bagi atau sadap dilaporkan ke balai wilayah sungai dalam tujuh hari setelah ditemukan.' },
    ],
  },
  {
    id: 'DOC-BM-01',
    unit: 'bina-marga',
    title: 'Prosedur Penanganan Darurat Jalan Nasional Pascabencana (contoh)',
    year: 2024,
    sections: [
      { ref: 'Langkah 1', text: 'Balai pelaksana jalan melakukan inventarisasi kerusakan jalan dan jembatan dalam 1 x 24 jam setelah kejadian bencana.' },
      { ref: 'Langkah 2', text: 'Penanganan darurat berupa pembukaan akses, jembatan sementara, atau pengalihan lalu lintas dilaksanakan paling lambat tiga hari setelah inventarisasi.' },
    ],
  },
  {
    id: 'DOC-CK-01',
    unit: 'cipta-karya',
    title: 'Panduan Pemeriksaan Kelaikan Fungsi Bangunan Gedung (contoh)',
    year: 2023,
    sections: [
      { ref: 'Bagian 3', text: 'Pemeriksaan kelaikan fungsi mencakup keandalan struktur, sistem proteksi kebakaran, instalasi listrik, dan tata udara.' },
      { ref: 'Bagian 5', text: 'Hasil pemeriksaan dicatat dalam daftar simak dan menjadi dasar penerbitan atau perpanjangan sertifikat laik fungsi.' },
    ],
  },
  {
    id: 'DOC-BPS-01',
    unit: 'bpsdm',
    title: 'Ketentuan Pengembangan Kompetensi Pegawai (contoh)',
    year: 2025,
    sections: [
      { ref: 'Pasal 2', text: 'Setiap pegawai mengikuti pengembangan kompetensi paling sedikit 20 jam pelajaran dalam satu tahun.' },
      { ref: 'Pasal 5', text: 'Pengajuan pelatihan dilakukan melalui atasan langsung dan dicatat dalam sistem informasi pengembangan kompetensi.' },
    ],
  },
  {
    id: 'DOC-PMB-01',
    unit: 'pembiayaan',
    title: 'Pedoman Pengajuan Pembiayaan Infrastruktur Skema KPBU (contoh)',
    year: 2024,
    sections: [
      { ref: 'Bab I', text: 'Pengajuan proyek KPBU dimulai dengan dokumen prastudi kelayakan yang memuat kajian teknis, ekonomi, hukum, dan lingkungan.' },
      { ref: 'Bab II', text: 'Penanggung jawab proyek kerja sama menyampaikan dokumen ke unit pembiayaan untuk dievaluasi paling lama 30 hari kerja.' },
    ],
  },
  {
    id: 'DOC-PS-01',
    unit: 'prasarana-strategis',
    title: 'Standar Pelaporan Kemajuan Proyek Strategis (contoh)',
    year: 2025,
    sections: [
      { ref: 'Bagian 2', text: 'Kemajuan fisik dan keuangan proyek strategis dilaporkan setiap minggu, disertai foto lapangan dan kendala yang dihadapi.' },
    ],
  },
];

// Kejadian bencana contoh dari SITABA. `daysAgo` dihitung relatif terhadap hari ini.
export const SITABA_EVENTS = [
  { id: 'SB-0912', type: 'Banjir', location: 'Kab. Bekasi, Jawa Barat', daysAgo: 1, status: 'Tanggap darurat', impact: 'Tanggul sungai jebol 40 m, 3 ruas jalan tergenang' },
  { id: 'SB-0907', type: 'Tanah longsor', location: 'Kab. Bogor, Jawa Barat', daysAgo: 2, status: 'Tanggap darurat', impact: 'Akses jalan kabupaten tertutup material longsor' },
  { id: 'SB-0899', type: 'Banjir', location: 'Kab. Kampar, Riau', daysAgo: 4, status: 'Pemulihan', impact: 'Saluran irigasi primer rusak ringan' },
  { id: 'SB-0890', type: 'Angin kencang', location: 'Kab. Cilacap, Jawa Tengah', daysAgo: 5, status: 'Pemulihan', impact: 'Atap gedung sekolah rusak' },
  { id: 'SB-0874', type: 'Gempa bumi', location: 'Kab. Cianjur, Jawa Barat', daysAgo: 9, status: 'Selesai', impact: 'Retak ringan pada 2 jembatan, sudah diperiksa' },
];
