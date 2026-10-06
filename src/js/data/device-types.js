// Metadata tipe perangkat IoT. `on` artinya: lampu/AC menyala, lock terkunci,
// sensor/CCTV aktif. `watt` dipakai untuk estimasi konsumsi daya.
export const DEVICE_TYPES = {
  light: { label: 'Lampu', icon: 'lightbulb', watt: 18, controllable: true, onLabel: 'menyala', offLabel: 'mati' },
  ac: { label: 'AC', icon: 'air-vent', watt: 850, controllable: true, onLabel: 'menyala', offLabel: 'mati' },
  sensor: { label: 'Sensor', icon: 'thermometer', watt: 2, controllable: false, onLabel: 'aktif', offLabel: 'nonaktif' },
  cctv: { label: 'CCTV', icon: 'cctv', watt: 7, controllable: false, onLabel: 'merekam', offLabel: 'nonaktif' },
  lock: { label: 'Smart Lock', icon: 'lock-keyhole', watt: 3, controllable: true, onLabel: 'terkunci', offLabel: 'terbuka' },
};

export const DEVICE_TYPE_KEYS = Object.keys(DEVICE_TYPES);

// Ruangan yang bukan ruang kerja: tidak dihitung untuk okupansi / pemborosan.
export const NON_WORKSPACE = new Set(['corridor', 'core', 'toilet']);

export const VEHICLE_TYPES = {
  car: { label: 'Mobil', icon: 'car' },
  motorcycle: { label: 'Motor', icon: 'bike' },
  truck: { label: 'Truk/Bus', icon: 'truck' },
};
