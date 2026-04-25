export async function runReviewWorker(params) {
    const response = await params.runSilentSubagent({ prompt: params.prompt });
    return parseReviewResult(response.text);
}
function parseReviewResult(text) {
    try {
        return JSON.parse(text);
    }
    catch (originalError) {
        const extracted = extractFirstJsonObject(text);
        if (!extracted) {
            const preview = text.length > 200 ? text.slice(0, 200) + "..." : text;
            throw new Error(`Failed to parse review result. Original error: ${originalError instanceof Error ? originalError.message : String(originalError)}. Text preview: ${preview}`);
        }
        return JSON.parse(extracted);
    }
}
function extractFirstJsonObject(text) {
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
