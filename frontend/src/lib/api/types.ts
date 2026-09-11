// Mirrors the backend's lean() document shapes (Mongo docs serialized to
// JSON over the wire — _id/refs are strings, dates are ISO strings).

export type RegistrationStatus = 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
export type SchoolStatus = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'GRACE' | 'SUSPENDED' | 'CANCELLED';

export interface Plan {
  _id: string;
  name: string;
  code: string;
  description?: string;
  priceMinor: number;
  currency: string;
  billingCycle: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  limits: { students: number; staff: number; storageMb: number; smsCredits: number };
  enabledModules: string[];
  features: string[];
  isActive: boolean;
}

export interface SchoolRegistration {
  _id: string;
  schoolName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  country?: string;
  curriculum?: string;
  expectedStudents?: number;
  requestedPlanId: string;
  status: RegistrationStatus;
  reviewNotes?: string | null;
  reviewedAt?: string | null;
  schoolId?: string | null;
  createdAt: string;
}

export interface RegistrationStatusResult {
  schoolName: string;
  status: RegistrationStatus;
  reviewNotes?: string;
  submittedAt: string;
  reviewedAt?: string | null;
}

export interface School {
  _id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string;
  contactEmail: string;
  contactPhone?: string;
  address?: string;
  status: SchoolStatus;
  createdAt: string;
  subscription?: { _id: string; status: SubscriptionStatus; planId: string } | null;
  userCount?: number;
}

export interface ApproveRegistrationResult {
  school: School;
  tempPassword: string;
  adminEmail: string;
}

export interface AcademicSession {
  _id: string;
  schoolId: string;
  name: string;
  /** ISO date string (stored UTC). */
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
