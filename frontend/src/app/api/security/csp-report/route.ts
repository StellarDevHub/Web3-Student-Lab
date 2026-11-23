import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    await req.json();
  } catch {
    // Ignore malformed JSON in CSP reports
  }
  return new NextResponse(null, { status: 204 });
}
