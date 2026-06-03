"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchUpcomingPlans,
  resolvePlanSelection,
  type PcoServiceTypeRef,
  type PlanScope,
  type UpcomingPlanOption,
} from "@/lib/pco/service-plan-selection";

export function usePcoServicePlanSelection() {
  const [planId, setPlanId] = useState("");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [serviceTypeOptions, setServiceTypeOptions] = useState<PcoServiceTypeRef[]>([]);
  const [planScope, setPlanScope] = useState<PlanScope | null>(null);
  const [upcomingPlans, setUpcomingPlans] = useState<UpcomingPlanOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPlan = useMemo(
    () => upcomingPlans.find((plan) => String(plan.planId) === planId) ?? null,
    [planId, upcomingPlans],
  );

  const loadOptions = useCallback(
    async (nextServiceTypeId = serviceTypeId) => {
      setBusy(true);
      setError(null);
      try {
        const payload = await fetchUpcomingPlans(nextServiceTypeId);
        if (!payload.ok) throw new Error(payload.error);

        setServiceTypeOptions(payload.serviceTypes ?? []);
        setPlanScope(
          payload.scopeName && payload.scopeSource
            ? { name: payload.scopeName, source: payload.scopeSource }
            : null,
        );
        setUpcomingPlans(payload.plans);

        const selection = resolvePlanSelection(payload.plans, payload.defaultPlanId, planId);
        if (selection) {
          setPlanId(selection.planId);
          setServiceTypeId(selection.serviceTypeId);
        } else {
          setPlanId("");
          if (payload.serviceTypeId) setServiceTypeId(String(payload.serviceTypeId));
        }

        if (payload.plans.length === 0) {
          setError("No upcoming plans found for this service type.");
        }
      } catch (e) {
        setUpcomingPlans([]);
        setPlanId("");
        setError(e instanceof Error ? e.message : "Failed to load upcoming plans.");
      } finally {
        setBusy(false);
      }
    },
    [planId, serviceTypeId],
  );

  const selectPlan = useCallback(
    (nextPlanId: string) => {
      setPlanId(nextPlanId);
      const plan = upcomingPlans.find((option) => String(option.planId) === nextPlanId);
      if (plan) setServiceTypeId(String(plan.serviceTypeId));
    },
    [upcomingPlans],
  );

  const loadOptionsRef = useRef(loadOptions);
  useEffect(() => {
    loadOptionsRef.current = loadOptions;
  });

  useEffect(() => {
    window.setTimeout(() => {
      void loadOptionsRef.current("");
    }, 0);
  }, []);

  return {
    planId,
    serviceTypeId,
    setServiceTypeId,
    serviceTypeOptions,
    planScope,
    upcomingPlans,
    busy,
    error,
    selectedPlan,
    loadOptions,
    selectPlan,
  };
}
