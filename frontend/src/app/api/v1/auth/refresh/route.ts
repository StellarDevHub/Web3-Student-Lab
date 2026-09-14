import { NextResponse } from 'next/server';

export async function POST() {
  const newAccessToken = `token-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  return NextResponse.json({
    accessToken: newAccessToken,
    token: newAccessToken,
  });
}
