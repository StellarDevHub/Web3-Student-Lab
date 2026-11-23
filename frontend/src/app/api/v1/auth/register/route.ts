import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, firstName, lastName, walletAddress } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const user = {
      id: `student-${Date.now()}`,
      email,
      name: `${firstName || ''} ${lastName || ''}`.trim() || email.split('@')[0],
      firstName: firstName || '',
      lastName: lastName || '',
      role: 'student',
      walletAddress: walletAddress || null,
    };

    const token = `token-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const refreshToken = `refresh-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const response = NextResponse.json(
      {
        user,
        token,
        refreshToken,
      },
      { status: 201 }
    );

    response.cookies.set('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process registration' }, { status: 500 });
  }
}
