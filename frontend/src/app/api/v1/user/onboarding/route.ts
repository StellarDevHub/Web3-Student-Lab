import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    hasCompletedWalletCreation: false,
    hasReceivedTokens: false,
    hasDeployedContract: false,
    currentStepIndex: 0,
  });
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    return NextResponse.json({ success: true, ...body });
  } catch {
    return NextResponse.json({ success: true });
  }
}
