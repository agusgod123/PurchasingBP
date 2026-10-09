// Netlify Scheduled Function: kirim antrean email tiap 10 menit.
const handler = async () => {
  const res = await fetch(`${process.env.URL}/api/cron/outbox`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  return new Response(await res.text(), { status: res.status });
};

export default handler;

export const config = { schedule: "*/10 * * * *" };
