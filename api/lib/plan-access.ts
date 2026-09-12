// Plan access matrix: every plan has limited access. Trial is a 7-day limited plan.
// Access is resolved from the dynamic subscription_plans table when a DB handle is
// available; otherwise the static PLAN_ACCESS fallback below is used.

import { loadSubscriptionPlanById } from '../db';

export type PlanId = string;

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

export function accessFromPlan(plan: any): PlanAccess {
  const fallback: any = (PLAN_ACCESS as any)[plan && plan.id] || PLAN_ACCESS.trial;
  const flags: any = (plan && plan.featureFlags) || {};
  return {
    maxStudents: plan && plan.maxStudentsLimit !== undefined ? plan.maxStudentsLimit : fallback.maxStudents,
    maxStaff: plan && plan.maxStaffLimit !== undefined ? plan.maxStaffLimit : fallback.maxStaff,
    modules: plan && Array.isArray(plan.modules) && plan.modules.length ? plan.modules : fallback.modules,
    features: {
      reportCards: !!flags.reportCards,
      principalHistory: !!flags.principalHistory,
      autopay: !!flags.autopay,
      domainEmail: !!flags.domainEmail,
      multiSchool: !!flags.multiSchool,
      prioritySupport: !!flags.prioritySupport,
      customDomainIncluded: !!flags.customDomainIncluded,
    },
  };
}

export async function getPlanAccess(planId: any, db?: any): Promise<PlanAccess> {
  if (db) {
    const plan = await loadSubscriptionPlanById(db, planId);
    if (plan) return accessFromPlan(plan);
  }
  return (PLAN_ACCESS as any)[planId] || PLAN_ACCESS.trial;
}

export function planAllowsModule(planId: any, moduleId: any) {
  return (((PLAN_ACCESS as any)[planId] || PLAN_ACCESS.trial).modules).indexOf(moduleId) !== -1;
}

export function planAllowsFeature(planId: any, feature: any) {
  return !!((PLAN_ACCESS as any)[planId] || PLAN_ACCESS.trial).features[feature];
}
