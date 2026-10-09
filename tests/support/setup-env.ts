// Pengujian memakai database terpisah agar data development tidak tersentuh.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/purchasing_test";
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.EMAIL_TRANSPORT = "disabled";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_PATH = "./storage-test";
process.env.SESSION_SECRET = "test-secret-0123456789abcdef";
