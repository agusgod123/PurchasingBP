import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/server/db";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Daftar" };

export default async function RegisterPage() {
  // Daftar bagian harus terbaru: render per permintaan, bukan saat build.
  await connection();
  const departments = await db.department.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  return <RegisterForm departments={departments} />;
}
