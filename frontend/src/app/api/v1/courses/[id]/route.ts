import { NextResponse } from 'next/server';
import { DEMO_COURSES } from '@/lib/api';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const course = DEMO_COURSES.find((c) => c.id === id);

  if (!course) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }

  return NextResponse.json({
    course,
    dataSource: 'live',
  });
}
