import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { can } from "@/server/auth/user";
import { db } from "@/server/db";
import { PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/permissions";
import { FaqBrowser } from "./faq-browser";
import { FaqDialog } from "./faq-dialog";

export const metadata: Metadata = { title: "FAQ & Panduan" };

export default async function HelpPage() {
  const user = await requireUser();
  const manage = can(user, PERMISSIONS.FAQ_MANAGE);
  const faqs = await db.faqArticle.findMany({
    where: manage ? {} : { isPublished: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { question: "asc" }],
  });
  return (
    <>
      <PageHeader
        title="FAQ & Panduan"
        description="Jawaban singkat untuk pertanyaan yang paling sering muncul. Tidak menemukan jawabannya? Kirim tiket ke Admin."
        actions={
          <>
            {manage && <FaqDialog categories={[...new Set(faqs.map((f) => f.category))]} />}
            <Button asChild variant={manage ? "outline" : "default"}>
              <Link href="/bantuan/tiket?baru=1">
                <LifeBuoy className="size-4" /> Hubungi Admin
              </Link>
            </Button>
          </>
        }
      />
      <FaqBrowser
        manage={manage}
        faqs={faqs.map((f) => ({
          id: f.id,
          category: f.category,
          question: f.question,
          answer: f.answer,
          sortOrder: f.sortOrder,
          isPublished: f.isPublished,
        }))}
      />
    </>
  );
}
