const env = import.meta.env;

export const config = {
  useMock: (env.VITE_USE_MOCK ?? 'true') !== 'false',
  apiBaseUrl: env.VITE_API_BASE_URL || '/api',
  wsUrl: env.VITE_WS_URL || '',
  pollInterval: Number(env.VITE_POLL_INTERVAL) || 5000,
  buildingName: env.VITE_BUILDING_NAME || 'Gedung Pusdatin',
};
