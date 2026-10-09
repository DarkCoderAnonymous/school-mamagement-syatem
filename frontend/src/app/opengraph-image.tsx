import { ImageResponse } from 'next/og';
import { PRODUCT_NAME } from '@/lib/site';

/**
 * Link-preview card (WhatsApp, LinkedIn, X, Facebook) for every page, built at
 * deploy time. Colours are the light theme's tokens converted to hex — the
 * image renderer doesn't understand oklch().
 */
export const alt = `${PRODUCT_NAME}: run your whole school from one calm workspace`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const COLORS = {
  background: '#f7f9fc', // --background
  foreground: '#192029', // --foreground
  muted: '#5c646f', // --muted-foreground
  primary: '#2368bd', // --primary
  teal: '#009690', // --chart-2
};

const MODULES = ['Admissions', 'Attendance', 'Fees', 'Exams', 'Payroll'];

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: COLORS.background,
        backgroundImage: `radial-gradient(circle at 100% 0%, ${COLORS.primary}26, transparent 55%), radial-gradient(circle at 0% 100%, ${COLORS.teal}1f, transparent 50%)`,
        color: COLORS.foreground,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundImage: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.teal})`,
          }}
        >
          {/* lucide GraduationCap, as in <BrandMark>. */}
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
            <path d="M22 10v6" />
            <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
          </svg>
        </div>
        <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>{PRODUCT_NAME}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div
          style={{
            fontSize: 76,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: -2.5,
            maxWidth: 980,
          }}
        >
          Run your whole school from one calm workspace.
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          {MODULES.map((module) => (
            <div
              key={module}
              style={{
                fontSize: 26,
                color: COLORS.muted,
                padding: '8px 20px',
                borderRadius: 999,
                border: `2px solid ${COLORS.primary}33`,
                background: '#ffffffcc',
              }}
            >
              {module}
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 26, color: COLORS.muted }}>
        School management software · web console for staff, mobile app for families
      </div>
    </div>,
    size,
  );
}
