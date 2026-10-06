// Hanya ikon yang dipakai yang di-import, supaya bundle kecil.
// Tambah ikon baru: import dari 'lucide' lalu masukkan ke objek ICONS.
import {
  createIcons, Activity, AirVent, ArrowRight, ArrowUpRight, Bike, Bot, Box, Building, Car, Cctv,
  CircleCheck, Clock, Droplets, Info, LayoutDashboard, Layers, Lightbulb, LockKeyhole, LogIn, LogOut, Map as MapIcon, Menu,
  MessageSquareText, Minus, Plus, Power, RotateCcw, ScanEye, Search, SendHorizontal, Sparkles, Square, SquareParking,
  Thermometer, ThermometerSun, TriangleAlert, Truck, User, Users, WifiOff, X, Zap,
} from 'lucide';

const ICONS = {
  Activity, AirVent, ArrowRight, ArrowUpRight, Bike, Bot, Box, Building, Car, Cctv,
  CircleCheck, Clock, Droplets, Info, LayoutDashboard, Layers, Lightbulb, LockKeyhole, LogIn, LogOut, Map: MapIcon, Menu,
  MessageSquareText, Minus, Plus, Power, RotateCcw, ScanEye, Search, SendHorizontal, Sparkles, Square, SquareParking,
  Thermometer, ThermometerSun, TriangleAlert, Truck, User, Users, WifiOff, X, Zap,
};

/** Ganti semua <i data-lucide="nama"> di dalam root menjadi SVG. */
export function renderIcons(root = document) {
  createIcons({ icons: ICONS, root, attrs: { 'stroke-width': 1.75, 'aria-hidden': 'true' } });
}

/** Markup placeholder ikon untuk template string. */
export const icon = (name, cls = 'size-4') => `<i data-lucide="${name}" class="${cls}"></i>`;
