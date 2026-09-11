'use client';

/**
 * Last-resort boundary for errors thrown by the root layout itself. It
 * replaces the whole document, so it must render its own <html>/<body> and
 * cannot rely on the app's providers, fonts or Tailwind theme — hence the
 * inline styles.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          background: '#fff',
          color: '#171717',
        }}
      >
        <div style={{ maxWidth: '28rem', padding: '1.5rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0 0 0.5rem' }}>Something went wrong</h1>
          <p style={{ fontSize: '0.875rem', color: '#737373', margin: '0 0 1.5rem' }}>
            The application failed to start. Try reloading — if the problem continues, contact support.
          </p>
          {error.digest && (
            <p style={{ fontSize: '0.75rem', color: '#737373', fontFamily: 'monospace' }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: 0,
              background: '#171717',
              color: '#fff',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
