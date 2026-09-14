import { NextResponse } from 'next/server';
import { DEMO_COURSES } from '@/lib/api';

export async function GET() {
  return NextResponse.json({
    courses: DEMO_COURSES,
    dataSource: 'live',
  });
}
