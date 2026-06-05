// En dev: vacío → Vite proxea /api a localhost:3001
// En prod: apunta al backend en Cloud Run
export const API_BASE = import.meta.env.VITE_API_BASE ?? '';
