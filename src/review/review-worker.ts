import type { ReviewResult } from "../types.js";

export async function runReviewWorker(params: {
  prompt: string;
  runSilentSubagent: (params: { prompt: string }) => Promise<{ text: string }>;
}): Promise<ReviewResult> {
  const response = await params.runSilentSubagent({ prompt: params.prompt });
  return JSON.parse(response.text) as ReviewResult;
}
