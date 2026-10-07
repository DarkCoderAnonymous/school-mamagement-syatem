import type { ReactNode } from 'react';

/**
 * A template (unlike the layout) remounts on every navigation, so moving
 * between sign-in, forgot-password and the school picker eases the new form
 * in while the brand panel in the layout stays put — spatial continuity
 * rather than a hard cut.
 */
export default function AuthTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-fade-up">{children}</div>;
}
