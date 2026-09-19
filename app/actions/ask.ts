"use server";

import { resolveCaller } from "@/app/actions/organizations";
import { askAboutGroceries as askAboutGroceriesDomain, type AskResult } from "@/lib/domain/ask";

export type { AskResult };

export async function askAboutGroceries(formData: FormData): Promise<AskResult> {
  const caller = await resolveCaller();
  const question = String(formData.get("q") ?? "");
  return askAboutGroceriesDomain(caller, question);
}
