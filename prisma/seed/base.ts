/**
 * Seed production: `pnpm db:seed`
 * Variabel opsional untuk membuat Admin pertama:
 *   ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD
 */
import { createSeedClient } from "./client";
import { seedAdmin, seedBase } from "./base-data";
import { checkPasswordPolicy } from "../../src/server/auth/password";

async function main() {
  const db = createSeedClient();
  try {
    await seedBase(db, { log: (m) => console.log(`✓ ${m}`) });
    const { ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
    if (ADMIN_USERNAME && ADMIN_EMAIL && ADMIN_PASSWORD) {
      const policy = checkPasswordPolicy(ADMIN_PASSWORD, { username: ADMIN_USERNAME });
      if (policy) throw new Error(`ADMIN_PASSWORD: ${policy}`);
      const admin = await seedAdmin(db, { username: ADMIN_USERNAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      console.log(`✓ Admin: ${admin.username} (wajib ganti password saat login pertama)`);
    } else {
      console.log("ℹ Lewati pembuatan Admin (isi ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD untuk membuatnya).");
    }
    console.log("Selesai.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
