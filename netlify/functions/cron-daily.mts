// Netlify Scheduled Function: keterlambatan PO, penanda tanpa aktivitas, pembersihan
// — 22:00 UTC = 06:00 WITA.
const handler = async () => {
  const res = await fetch(`${process.env.URL}/api/cron/daily`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  return new Response(await res.text(), { status: res.status });
};

export default handler;

export const config = { schedule: "0 22 * * *" };
