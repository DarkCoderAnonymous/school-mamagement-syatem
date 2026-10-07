/**
 * Each section of the platform console settles in when you navigate to it — a
 * short fade and a few pixels of rise, so a new screen reads as arriving
 * rather than snapping. A template remounts only when the route segment
 * changes; filters, tabs and pagination (search params) don't replay it.
 * Reduced-motion users get the final state immediately (globals.css).
 */
export default function ConsoleTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
