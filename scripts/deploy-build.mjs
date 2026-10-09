// Build untuk platform hosting (Vercel/Netlify):
// - selalu `prisma generate` + `next build`
// - `prisma migrate deploy` HANYA untuk deploy production, agar preview deploy
//   tidak mengubah database produksi. Paksa dengan RUN_MIGRATIONS=true,
//   lewati dengan SKIP_MIGRATIONS=true.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const isProduction =
  process.env.VERCEL_ENV === "production" || process.env.CONTEXT === "production" || process.env.RUN_MIGRATIONS === "true";

run("pnpm exec prisma generate");
if (isProduction && process.env.SKIP_MIGRATIONS !== "true") {
  console.log("→ Menjalankan migrasi database (production)…");
  run("pnpm exec prisma migrate deploy");
} else {
  console.log("→ Melewati migrasi (bukan deploy production).");
}
run("pnpm exec next build");
