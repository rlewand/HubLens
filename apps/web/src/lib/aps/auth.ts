const APS_BASE_URL = "https://developer.api.autodesk.com";

export interface ApsTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export function getApsCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.APS_CLIENT_ID?.trim();
  const clientSecret = process.env.APS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return null;
  }
  return { clientId, clientSecret };
}

export function isApsConfigured(): boolean {
  return getApsCredentials() !== null;
}

/**
 * Two-legged token for server-side Data Management calls.
 * Requires the APS app to be provisioned on the target BIM 360 / ACC account.
 */
export async function getTwoLeggedToken(
  scopes = "data:read account:read",
): Promise<string> {
  const credentials = getApsCredentials();
  if (!credentials) {
    throw new Error(
      "APS_CLIENT_ID and APS_CLIENT_SECRET must be set to call Data Management APIs.",
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: scopes,
  });

  const response = await fetch(`${APS_BASE_URL}/authentication/v2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${credentials.clientId}:${credentials.clientSecret}`,
      ).toString("base64")}`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`APS token request failed (${response.status}): ${detail}`);
  }

  const payload = (await response.json()) as ApsTokenResponse;
  return payload.access_token;
}
