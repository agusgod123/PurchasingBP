// Netlify Scheduled Function: pengingat & eskalasi persetujuan tiap jam pada jam kerja
// (jadwal dalam UTC: 00–09 UTC = 08–17 WITA, Senin–Jumat).
const handler = async () => {
  const res = await fetch(`${process.env.URL}/api/cron/approvals`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  return new Response(await res.text(), { status: res.status });
};

export default handler;

export const config = { schedule: "5 0-9 * * 1-5" };
