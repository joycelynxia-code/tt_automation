import path from "node:path";
import type { CanonicalTaxModel } from "../types/index.js";
import { getByPath } from "../utils/jsonPath.js";
import { loadApprovedSourceMappings } from "../sourceMappings/sourceMappingRegistry.js";
import { applySourceMapping } from "../sourceMappings/applySourceMapping.js";
import { detectUnknownSourceSections } from "../sourceMappings/detectUnknownSourceSections.js";

function address(rawAddress: unknown) {
  const a = rawAddress as Record<string, unknown> | undefined;
  if (!a) return undefined;
  return {
    line1: a.address_line_1,
    apt: a.apt_number ?? null,
    city: a.city,
    state: a.state,
    zip: a.zip_code,
    county: a.county,
    country: a.country,
  };
}

export function buildCanonicalModel(raw: Record<string, unknown>, projectRoot = process.cwd()): CanonicalTaxModel {
  const profile = (raw.profile ?? {}) as Record<string, unknown>;
  const primary = (getByPath(raw, "profile.primary") ?? {}) as Record<string, unknown>;
  const basic = (getByPath(raw, "profile.primary.basic_info") ?? {}) as Record<string, unknown>;
  const name = (getByPath(raw, "profile.primary.basic_info.name") ?? {}) as Record<string, unknown>;
  const taxpayerAddress = address(getByPath(raw, "profile.primary.address.residency_address"));

  const mappings = loadApprovedSourceMappings(projectRoot);
  const documents = mappings.flatMap((mapping) => applySourceMapping(raw, mapping));
  const pendingDir = path.join(projectRoot, "data/mappings/source/pending");
  const unmappedSourceSections = detectUnknownSourceSections(raw, mappings, { pendingDir, writePending: true });

  return {
    source: {
      system: "april",
      convertedAt: new Date().toISOString(),
      anonymized: Boolean((raw.anonymization_metadata as Record<string, unknown> | undefined)?.is_anonymized),
      safeForFiling: false,
    },
    taxpayer: {
      firstName: name.first_name,
      lastName: name.last_name,
      middleName: name.middle_name ?? null,
      suffix: name.suffix ?? null,
      filingStatus: getByPath(raw, "profile.household.filing_status.federal"),
      birthDate: getByPath(raw, "profile.primary.basic_info.age.birth_date"),
      ssn: getByPath(raw, "profile.primary.identification.ssn_social_security_number"),
      occupation: basic.occupation,
      email: getByPath(raw, "profile.primary.basic_info.contact_info.email_address"),
      address: taxpayerAddress,
      driversLicense: getByPath(raw, "profile.primary.basic_info.drivers_license_or_state_id"),
      canBeClaimedAsDependent: getByPath(raw, "profile.primary.basic_info.person_claimed_as_dependent_check.is_possible_to_be_claimed_as_dependent_of_another"),
      isBlind: getByPath(raw, "profile.primary.basic_info.tax_situation_indicators.is_blind"),
      isMilitary: getByPath(raw, "profile.primary.basic_info.tax_situation_indicators.is_military"),
      isDisabled: getByPath(raw, "profile.primary.basic_info.disability.is_disabled"),
      studentStatus: getByPath(raw, "profile.primary.basic_info.education.student_status"),
    },
    federal: {
      presidentialElectionFundDonation: getByPath(raw, "profile.primary.elections_and_disallowances.is_presidential_election_fund_donation"),
      healthCoverageAllYear: getByPath(raw, "profile.primary.affordable_care_act.localities.all_states.is_household_covered_all_year"),
      priorYearAgi: getByPath(raw, "profile.primary.basic_info.pin.prior_year_agi.federal.prior_year_agi"),
      identityProtectionPinUsed: getByPath(raw, "profile.primary.basic_info.pin.identity_protection_pin.is_ip_pin"),
      identityProtectionPin: getByPath(raw, "profile.primary.basic_info.pin.identity_protection_pin.ip_pin"),
    },
    documents,
    deductionsCredits: {
      studentLoanInterestPaid: getByPath(raw, "profile.primary.student_loans.f1098e_form.student_loan_interest_paid"),
      rothIraContribution: getByPath(raw, "profile.primary.retirement.plan_contributions.roth_ira_amount"),
      yearEndRothIraValue: getByPath(raw, "profile.primary.retirement.plan_contributions.year_end_roth_ira_amt"),
      hasPriorYearRothExcessContributions: getByPath(raw, "profile.primary.retirement.plan_contributions.is_roth_py_excess_contributions"),
    },
    state: {
      stateNexus: getByPath(raw, "profile.household.state_nexus"),
      primaryResidenceState: taxpayerAddress?.state,
      primaryResidenceCounty: taxpayerAddress?.county,
    },
    flags: {
      ...((getByPath(raw, "profile.primary.life_events.sections_used") ?? {}) as Record<string, unknown>),
      ...((getByPath(raw, "profile.flow.investment") ?? {}) as Record<string, unknown>),
      ...((getByPath(raw, "profile.flow.deductions.contributions") ?? {}) as Record<string, unknown>),
      ...((getByPath(raw, "profile.flow.credits.payments") ?? {}) as Record<string, unknown>),
    },
    unmappedSourceSections,
  };
}
