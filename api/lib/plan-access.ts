// Plan access matrix: every plan has limited access. Trial is a 7-day limited plan.

export type PlanId = 'trial' | 'starter' | 'pro' | 'enterprise';

export interface PlanAccess {
  maxStudents: number | null;
  maxStaff: number | null;
  modules: string[];
  features: {
    reportCards: boolean;
    principalHistory: boolean;
    autopay: boolean;
    domainEmail: boolean;
    multiSchool: boolean;
    prioritySupport: boolean;
    customDomainIncluded: boolean;
  };
}

export const PLAN_ACCESS = {
  trial: {
    maxStudents: 50,
    maxStaff: 10,
    modules: ['dashboard', 'students', 'attendance', 'staff', 'notices', 'fees', 'settings', 'billing'],
    features: { reportCards: false, principalHistory: false, autopay: false, domainEmail: false, multiSchool: false, prioritySupport: false, customDomainIncluded: false },
  },
  starter: {
    maxStudents: 500,
    maxStaff: 25,
    modules: ['dashboard', 'students', 'attendance', 'staff', 'notices', 'fees', 'exams', 'settings', 'billing'],
    features: { reportCards: false, principalHistory: false, autopay: false, domainEmail: false, multiSchool: false, prioritySupport: false, customDomainIncluded: false },
  },
  pro: {
    maxStudents: 1500,
    maxStaff: 100,
    modules: ['dashboard', 'students', 'attendance', 'staff', 'notices', 'fees', 'exams', 'principal', 'settings', 'billing'],
    features: { reportCards: true, principalHistory: true, autopay: true, domainEmail: true, multiSchool: false, prioritySupport: true, customDomainIncluded: false },
  },
  enterprise: {
    maxStudents: null,
    maxStaff: null,
    modules: ['dashboard', 'students', 'attendance', 'staff', 'notices', 'fees', 'exams', 'principal', 'settings', 'billing'],
    features: { reportCards: true, principalHistory: true, autopay: true, domainEmail: true, multiSchool: true, prioritySupport: true, customDomainIncluded: true },
  },
};

export function getPlanAccess(planId: any) {
  return PLAN_ACCESS[planId] || PLAN_ACCESS.trial;
}

export function planAllowsModule(planId: any, moduleId: any) {
  return getPlanAccess(planId).modules.indexOf(moduleId) !== -1;
}

export function planAllowsFeature(planId: any, feature: any) {
  return !!getPlanAccess(planId).features[feature];
}