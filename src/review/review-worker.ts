import type { ReviewResult } from "../types.js";

export async function runReviewWorker(params: {
  prompt: string;
  runSilentSubagent: (params: { prompt: string }) => Promise<{ text: string }>;
}): Promise<ReviewResult> {
  const response = await params.runSilentSubagent({ prompt: params.prompt });
  return parseReviewResult(response.text);
}

function parseReviewResult(text: string): ReviewResult {
  try {
    return JSON.parse(text) as ReviewResult;
  } catch (originalError) {
    const extracted = extractFirstJsonObject(text);
    if (!extracted) {
      throw originalError;
    }
    return JSON.parse(extracted) as ReviewResult;
  }
}

function extractFirstJsonObject(text: string) {
  const start = text.indexOf("{");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}
