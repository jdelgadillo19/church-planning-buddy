import { NextResponse } from "next/server";
import {
  isProPresenterUnavailableOnHosted,
  ppHostedUnavailableResponse,
} from "@/lib/propresenter/hosted";

/** Guard PP-only API routes on Workers; returns a response or null to continue. */
export function guardProPresenterOnHosted(): NextResponse | null {
  if (isProPresenterUnavailableOnHosted()) {
    return ppHostedUnavailableResponse();
  }
  return null;
}
