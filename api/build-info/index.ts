export async function GET() {
  return new Response(
    JSON.stringify({
      sha: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
      timestamp: process.env.VERCEL_GIT_COMMIT_TIMESTAMP || new Date().toISOString(),
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
