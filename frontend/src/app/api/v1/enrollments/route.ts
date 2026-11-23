import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json([]);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    return NextResponse.json(
      {
        id: `enrollment-${Date.now()}`,
        studentId: body.studentId || 'current-student',
        courseId: body.courseId,
        enrolledAt: new Date().toISOString(),
        status: 'active',
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: 'Enrollment failed' }, { status: 500 });
  }
}
