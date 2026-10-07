// Model AI yang bisa dipilih di chatbot, beserta harga acuan per 1 juta token (USD).
// Dipakai untuk estimasi biaya di analitik. Sesuaikan dengan harga kontrak/penyedia yang dipakai.
export const MODEL_PRICES = {
  'GPT-4o Mini': { input: 0.15, output: 0.6 },
  'GPT-4o': { input: 2.5, output: 10 },
};

export const MODELS = Object.keys(MODEL_PRICES);

// Kurs untuk menampilkan biaya dalam rupiah.
export const USD_TO_IDR = 16500;

/** Estimasi biaya (Rp) dari jumlah token. */
export function tokenCostRupiah(model, inputTokens, outputTokens) {
  const price = MODEL_PRICES[model] ?? MODEL_PRICES[MODELS[0]];
  return ((inputTokens * price.input + outputTokens * price.output) / 1e6) * USD_TO_IDR;
}

/** Perkiraan kasar jumlah token dari teks (± 4 karakter per token). */
export const estimateTokens = (text) => Math.max(1, Math.ceil(String(text ?? '').length / 4));
