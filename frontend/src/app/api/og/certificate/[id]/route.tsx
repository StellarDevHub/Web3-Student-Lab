import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const resolvedParams = await Promise.resolve(context.params);
  const certificateId = resolvedParams?.id || 'UNKNOWN';

  const { searchParams } = new URL(request.url);
  const studentName = searchParams.get('studentName') || searchParams.get('name') || 'Stellar Builder';
  const courseTitle = searchParams.get('course') || searchParams.get('courseTitle') || 'Soroban Smart Contract Developer';
  const issueDate = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const certificateHash = searchParams.get('hash') || `0x${certificateId.padStart(64, '0').slice(-64)}`;
  const badgeIcon = searchParams.get('badge') || 'stellar';

  const shortHash = certificateHash.length > 20
    ? `${certificateHash.slice(0, 10)}...${certificateHash.slice(-8)}`
    : certificateHash;

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#09090b',
          backgroundImage: 'radial-gradient(circle at 50% 0%, #1f1235 0%, #09090b 70%)',
          fontFamily: 'sans-serif',
          padding: '40px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '1120px',
            height: '550px',
            borderRadius: '24px',
            border: '2px solid rgba(239, 68, 68, 0.4)',
            backgroundColor: 'rgba(15, 15, 20, 0.85)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(239, 68, 68, 0.15)',
            padding: '48px 56px',
            justifyContent: 'space-between',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontSize: '24px',
                  fontWeight: 800,
                }}
              >
                ★
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span
                  style={{
                    fontSize: '20px',
                    fontWeight: 900,
                    letterSpacing: '0.15em',
                    color: '#ffffff',
                    textTransform: 'uppercase',
                  }}
                >
                  WEB3 STUDENT LAB
                </span>
                <span style={{ fontSize: '13px', color: '#9ca3af', letterSpacing: '0.05em' }}>
                  Stellar & Soroban Educational Credential
                </span>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '9999px',
                padding: '6px 16px',
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#22c55e',
                }}
              />
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#fca5a5',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Verified On-Chain
              </span>
            </div>
          </div>

          {/* Main Content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              marginTop: '16px',
            }}
          >
            <span
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#ef4444',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
              }}
            >
              Certificate of Completion
            </span>
            <span
              style={{
                fontSize: '44px',
                fontWeight: 900,
                color: '#ffffff',
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
              }}
            >
              {studentName}
            </span>
            <span
              style={{
                fontSize: '22px',
                fontWeight: 600,
                color: '#d1d5db',
                marginTop: '4px',
              }}
            >
              Successfully completed: {courseTitle}
            </span>
          </div>

          {/* Footer Metadata */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              paddingTop: '24px',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Certificate Hash
              </span>
              <span style={{ fontSize: '15px', fontFamily: 'monospace', color: '#f3f4f6' }}>
                {shortHash}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Issued Date
              </span>
              <span style={{ fontSize: '15px', color: '#f3f4f6' }}>
                {issueDate}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Certificate ID
              </span>
              <span style={{ fontSize: '15px', fontFamily: 'monospace', color: '#f87171' }}>
                #{certificateId}
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
