export type Role = 'CITIZEN' | 'OFFICIAL' | 'AUTHORITY' | 'ADMIN';

export type Status =
  | 'NEW' | 'TRIAGE' | 'ROUTED' | 'IN_PROGRESS'
  | 'BREACHED' | 'ESCALATED' | 'RESOLVED' | 'CLOSED';

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  role: Role;
  departmentId: string | null;
  department?: string | null;
}

export interface Complaint {
  id: string;
  rawText: string;
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: Status;
  lat: number;
  lng: number;
  ward: string | null;
  zone?: string | null;
  jurisdiction: string | null;
  department: string | null;
  departmentId: string | null;
  slaDeadline: string | null;
  escalationLevel: number;
  classifierConfidence: number | null;
  classifierSource: string | null;
  hasPhoto: boolean;
  hasVoice: boolean;
  photoUrl?: string | null;
  reporter?: { id: string; name: string | null };
  createdAt: string;
}

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  category: string;
  severity: string;
  status: Status;
  escalationLevel: number;
  slaDeadline: string | null;
  ward: string | null;
}

export interface QueueItem {
  id: string;
  rawText: string;
  category: string;
  severity: string;
  status: Status;
  ward: string | null;
  lat: number;
  lng: number;
  slaDeadline: string | null;
  escalationLevel: number;
  msLeft: number | null;
  nearBreach: boolean;
  overdue: boolean;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  kind: string;
  actorId: string | null;
  detail: Record<string, unknown>;
  prevHash: string;
  hash: string;
  createdAt: string;
}
