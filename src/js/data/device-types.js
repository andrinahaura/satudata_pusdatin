// Metadata tipe perangkat IoT, mengikuti perangkat yang terpasang di gedung (Sinatra BGC):
// saklar lampu dan sensor kehadiran (HPS).
// `on` artinya: lampu menyala, sensor kehadiran mendeteksi orang.
// `watt` dipakai untuk estimasi konsumsi daya.
export const DEVICE_TYPES = {
  light: { label: 'Lampu', icon: 'lightbulb', watt: 18, controllable: true, onLabel: 'menyala', offLabel: 'padam' },
  presence: { label: 'Sensor kehadiran', icon: 'users', watt: 2, controllable: false, onLabel: 'ada orang', offLabel: 'kosong' },
};

export const DEVICE_TYPE_KEYS = Object.keys(DEVICE_TYPES);

// Ruangan yang bukan ruang kerja: tidak dihitung untuk okupansi / pemborosan.
export const NON_WORKSPACE = new Set(['corridor', 'core', 'toilet', 'storage']);

export const VEHICLE_TYPES = {
  car: { label: 'Mobil', icon: 'car' },
  motorcycle: { label: 'Motor', icon: 'bike' },
  truck: { label: 'Truk/Bus', icon: 'truck' },
};
