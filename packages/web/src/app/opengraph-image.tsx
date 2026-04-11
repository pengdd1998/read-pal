import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'read-pal — A Friend Who Reads With You';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fefdfb',
          backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(217,119,6,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(20,184,166,0.06) 0%, transparent 50%)',
        }}
      >
        {/* Decorative top bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            background: 'linear-gradient(to right, #d97706, #14b8a6)',
          }}
        />

        {/* Logo / Brand */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #d97706, #b45309)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
            }}
          >
            <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
              <path d="M6 6h6c1.1 0 2 .9 2 2v14c0-1.1-.9-2-2-2H6V6z" fill="white" opacity="0.95"/>
              <path d="M26 6h-6c-1.1 0-2 .9-2 2v14c0-1.1.9-2 2-2h6V6z" fill="white" opacity="0.85"/>
              <circle cx="22" cy="10" r="3" fill="#14b8a6"/>
              <path d="M21 10l1 1 2-2" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span
            style={{
              fontSize: 48,
              fontWeight: 700,
              color: '#1e2a38',
              letterSpacing: '-0.02em',
            }}
          >
            read-pal
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 36,
            fontWeight: 600,
            color: '#1e2a38',
            textAlign: 'center',
            lineHeight: 1.3,
            maxWidth: 800,
            marginBottom: 24,
          }}
        >
          A Friend Who Reads With You
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 20,
            color: '#6b5e4d',
            textAlign: 'center',
            maxWidth: 640,
            lineHeight: 1.5,
          }}
        >
          Upload any book and read alongside an AI companion who explains concepts, asks questions, and helps you remember every insight.
        </div>

        {/* CTA badge */}
        <div
          style={{
            marginTop: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 32px',
            borderRadius: 100,
            background: 'linear-gradient(135deg, #d97706, #14b8a6)',
            color: 'white',
            fontSize: 18,
            fontWeight: 600,
          }}
        >
          Start Reading Free
        </div>

        {/* Feature pills */}
        <div
          style={{
            marginTop: 32,
            display: 'flex',
            gap: 12,
          }}
        >
          {['AI Companion', 'Knowledge Graph', 'Smart Highlights'].map((text) => (
            <div
              key={text}
              style={{
                padding: '8px 20px',
                borderRadius: 100,
                border: '1px solid #ddd3c5',
                fontSize: 14,
                color: '#6b5e4d',
                backgroundColor: '#f9f5f0',
              }}
            >
              {text}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
