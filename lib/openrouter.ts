type OpenRouterMessagePart =
  | string
  | {
      text?: string;
      type?: string;
    };

type OpenRouterResponsePayload = {
  choices?: Array<{
    message?: {
      content?: OpenRouterMessagePart | OpenRouterMessagePart[];
    };
  }>;
  error?: {
    message?: string;
  };
};

function getOpenRouterApiKey() {
  return process.env.OPENROUTER_API_KEY?.trim() ?? "";
}

export function getOpenRouterHeaders() {
  const apiKey = getOpenRouterApiKey();

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing.");
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export async function parseOpenRouterResponse(response: Response) {
  const payload = (await response.json()) as OpenRouterResponsePayload;

  if (!response.ok) {
    throw new Error(
      payload.error?.message || "OpenRouter request failed unexpectedly.",
    );
  }

  return payload;
}

export function extractOpenRouterText(payload: OpenRouterResponsePayload) {
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        return part.text ?? "";
      })
      .join("\n")
      .trim();
  }

  if (content && typeof content === "object") {
    return content.text ?? "";
  }

  throw new Error("OpenRouter did not return message content.");
}
