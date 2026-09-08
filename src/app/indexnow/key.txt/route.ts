import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /indexnow/key.txt
 *
 * IndexNow validates ownership by fetching the keyLocation declared in
 * each submission and comparing its body to the `key` field. Without a
 * served key file every real submission fails validation, so this route
 * is the other half of `submitIndexNow` in lib/one/seo/seo-agent.
 *
 * The key is not a secret — it is a proof that the submitter can publish
 * to this host — but it only exists when INDEXNOW_KEY is configured.
 * Unconfigured, the path 404s and submissions stay dry runs.
 */
export async function GET() {
  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    return new NextResponse('not found', { status: 404 });
  }
  return new NextResponse(key, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
