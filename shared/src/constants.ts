/**
 * Attendance status recorded per student per day/period.
 */
export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  HALF_DAY = 'HALF_DAY',
  EXCUSED = 'EXCUSED',
}

/**
 * How often a fee item is charged.
 */
export enum FeeFrequency {
  ONE_TIME = 'ONE_TIME',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  HALF_YEARLY = 'HALF_YEARLY',
  ANNUAL = 'ANNUAL',
}

/**
 * Types of exams a school can configure.
 */
export enum ExamType {
  UNIT_TEST = 'UNIT_TEST',
  MID_TERM = 'MID_TERM',
  FINAL = 'FINAL',
  QUIZ = 'QUIZ',
  PRACTICAL = 'PRACTICAL',
  ASSIGNMENT = 'ASSIGNMENT',
}

/**
 * Default grade bands used when a school does not define its own grading
 * scale. Percentage ranges are inclusive of `minPercent`, exclusive of the
 * next band's `minPercent`.
 */
export interface GradeBand {
  grade: string;
  minPercent: number;
  description: string;
}

export const DEFAULT_GRADE_BANDS: readonly GradeBand[] = [
  { grade: 'A+', minPercent: 90, description: 'Outstanding' },
  { grade: 'A', minPercent: 80, description: 'Excellent' },
  { grade: 'B+', minPercent: 70, description: 'Very Good' },
  { grade: 'B', minPercent: 60, description: 'Good' },
  { grade: 'C', minPercent: 50, description: 'Average' },
  { grade: 'D', minPercent: 40, description: 'Below Average' },
  { grade: 'F', minPercent: 0, description: 'Fail' },
] as const;
