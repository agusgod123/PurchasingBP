import type { Metadata } from "next";
import { ListTodo, PartyPopper } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { taskCenter } from "@/server/queries/tasks";
import { TaskList } from "@/components/app/task-list";
import { PageHeader, EmptyState } from "@/components/app/ui";

export const metadata: Metadata = { title: "Pusat Tugas" };

export default async function TasksPage() {
  const user = await requireUser();
  const groups = (await taskCenter(user)).filter((g) => g.items.length > 0);
  return (
    <>
      <PageHeader title="Pusat Tugas" description="Semua yang perlu Anda tindak lanjuti, dihitung langsung dari kondisi transaksi." />
      {groups.length === 0 ? (
        <EmptyState icon={PartyPopper} title="Tidak ada tugas" description="Semua sudah beres. Tugas baru akan muncul di sini dan di lonceng notifikasi." />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} className="overflow-hidden rounded-xl border bg-card">
              <header className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
                <div>
                  <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                    <ListTodo className="size-4 text-muted-foreground" /> {g.title}
                    <span className="rounded-full bg-primary/10 px-2 text-xs text-primary">{g.items.length}</span>
                  </h2>
                  <p className="text-[13px] text-muted-foreground">{g.description}</p>
                </div>
              </header>
              <TaskList group={g} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
