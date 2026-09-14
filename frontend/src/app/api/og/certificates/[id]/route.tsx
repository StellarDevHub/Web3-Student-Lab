import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const certificateId = params.id;

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
          backgroundColor: '#0a0a0a',
          backgroundImage: 'linear-gradient(135deg, #18181b 0%, #000000 50%, #18181b 100%)',
          fontFamily: 'monospace',
          padding: '80px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: '4px solid rgba(220, 38, 38, 0.4)',
            borderRadius: '40px',
            padding: '60px 80px',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            boxShadow: '0 0 60px rgba(220, 38, 38, 0.2)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '40px',
            }}
          >
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                backgroundColor: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 30px rgba(220, 38, 38, 0.5)',
              }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
          </div>

          <div
            style={{
              fontSize: '32px',
              fontWeight: '900',
              color: '#dc2626',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginBottom: '16px',
            }}
          >
            WEB3 STUDENT LAB
          </div>

          <div
            style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#9ca3af',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              marginBottom: '40px',
            }}
          >
            Blockchain-Verified Certificate
          </div>

          <div
            style={{
              fontSize: '48px',
              fontWeight: '900',
              color: '#ffffff',
              letterSpacing: '0.05em',
              marginBottom: '24px',
              textAlign: 'center',
            }}
          >
            CERTIFICATE #{certificateId}
          </div>

          <div
            style={{
              fontSize: '20px',
              fontWeight: '500',
              color: '#d4d4d4',
              marginBottom: '40px',
              textAlign: 'center',
            }}
          >
            This cryptographic token proves execution and mastery of the linked learning module.
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '40px',
              fontSize: '18px',
              color: '#9ca3af',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', letterSpacing: '0.2em', marginBottom: '8px' }}>NETWORK</span>
              <span style={{ color: '#6b7280' }}>Stellar Testnet</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', letterSpacing: '0.2em', marginBottom: '8px' }}>STANDARD</span>
              <span style={{ color: '#6b7280' }}>Soroban NFT</span>
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
