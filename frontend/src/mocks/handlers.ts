import { http, HttpResponse, delay } from 'msw';

export const mockCourses = [
  {
    id: 'course-1',
    title: 'Introduction to Stellar Smart Contracts',
    description: 'Learn the fundamentals of Soroban smart contract development.',
    level: 'Beginner',
    duration: '4 hours',
  },
  {
    id: 'course-2',
    title: 'Advanced Web3 Security & Verification',
    description: 'Master cryptographic signatures, KMS signers, and security audit practices.',
    level: 'Advanced',
    duration: '6 hours',
  },
];

export const mockCertificates = [
  {
    id: 'cert-101',
    title: 'Certified Soroban Developer',
    recipient: 'GAAX...STUDENT',
    issueDate: '2026-08-25',
    verified: true,
    txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  },
];

export const mockUser = {
  id: 'usr-1',
  email: 'student@web3lab.edu',
  name: 'Stellar Student',
  role: 'STUDENT',
};

export const handlers = [
  // Auth handlers
  http.post('/api/auth/login', async ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('error') === '500') {
      return new HttpResponse(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
    const body = (await request.json()) as any;
    if (body.email === 'invalid@test.com') {
      return new HttpResponse(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
    }
    return HttpResponse.json({
      token: 'jwt-mock-token-12345',
      user: mockUser,
    });
  }),

  http.post('/api/auth/register', async ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('error') === '500') {
      return new HttpResponse(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
    return HttpResponse.json({
      token: 'jwt-mock-token-registered',
      user: mockUser,
    }, { status: 201 });
  }),

  http.get('/api/auth/me', async ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('error') === '500') {
      return new HttpResponse(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new HttpResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    return HttpResponse.json(mockUser);
  }),

  // Course handlers
  http.get('/api/courses', async ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('error') === '500') {
      return new HttpResponse(JSON.stringify({ error: 'Database query failed' }), { status: 500 });
    }
    if (url.searchParams.get('empty') === 'true') {
      return HttpResponse.json([]);
    }
    if (url.searchParams.get('delay') === 'true') {
      await delay(100);
    }
    return HttpResponse.json(mockCourses);
  }),

  http.get('/api/courses/:id', async ({ params, request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('error') === '500') {
      return new HttpResponse(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
    const course = mockCourses.find((c) => c.id === params.id);
    if (!course) {
      return new HttpResponse(JSON.stringify({ error: 'Course not found' }), { status: 404 });
    }
    return HttpResponse.json(course);
  }),

  http.post('/api/courses/:id/enroll', async ({ params, request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('error') === '500') {
      return new HttpResponse(JSON.stringify({ error: 'Enrollment failed' }), { status: 500 });
    }
    return HttpResponse.json({
      success: true,
      message: `Enrolled in course ${params.id}`,
    });
  }),

  // Certificate handlers
  http.get('/api/certificates', async ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('error') === '500') {
      return new HttpResponse(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
    if (url.searchParams.get('empty') === 'true') {
      return HttpResponse.json([]);
    }
    return HttpResponse.json(mockCertificates);
  }),

  http.get('/api/certificates/:id', async ({ params, request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('error') === '500') {
      return new HttpResponse(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
    const cert = mockCertificates.find((c) => c.id === params.id);
    if (!cert) {
      return new HttpResponse(JSON.stringify({ error: 'Certificate not found' }), { status: 404 });
    }
    return HttpResponse.json(cert);
  }),

  http.post('/api/certificates/verify', async ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('error') === '500') {
      return new HttpResponse(JSON.stringify({ error: 'Verification service unreachable' }), { status: 500 });
    }
    const body = (await request.json()) as any;
    if (body.txHash === 'invalid') {
      return HttpResponse.json({ verified: false, error: 'Invalid transaction hash signature' }, { status: 400 });
    }
    return HttpResponse.json({
      verified: true,
      certificate: mockCertificates[0],
    });
  }),
];
