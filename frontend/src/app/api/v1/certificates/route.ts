import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json([]);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    return NextResponse.json(
      {
        success: true,
        certificate: {
          id: `cert-${Date.now()}`,
          studentId: body.studentId || 'current-student',
          courseId: body.courseId,
          issuedAt: new Date().toISOString(),
        },
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: 'Failed to issue certificate' }, { status: 500 });
  }
}
