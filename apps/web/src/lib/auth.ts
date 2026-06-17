import path from "node:path";
import { prisma } from "@hublens/db";
import type { SessionUser } from "./session";
import { createSessionToken } from "./session";

export const MOCK_CONSULTANT = {
  autodeskUserId: "mock-consultant-001",
  email: "consultant@example.com",
  name: "Principal Consultant",
} as const;

export async function ensureMockUser(): Promise<SessionUser> {
  const user = await prisma.user.upsert({
    where: { autodeskUserId: MOCK_CONSULTANT.autodeskUserId },
    update: {
      email: MOCK_CONSULTANT.email,
      name: MOCK_CONSULTANT.name,
    },
    create: {
      autodeskUserId: MOCK_CONSULTANT.autodeskUserId,
      email: MOCK_CONSULTANT.email,
      name: MOCK_CONSULTANT.name,
    },
  });

  return {
    id: user.id,
    autodeskUserId: user.autodeskUserId,
    email: user.email ?? MOCK_CONSULTANT.email,
    name: user.name ?? MOCK_CONSULTANT.name,
  };
}

export async function loginMockUser(): Promise<string> {
  const user = await ensureMockUser();
  return createSessionToken(user);
}

export function getRepoRoot(): string {
  return path.resolve(process.cwd(), "../..");
}

export function getInputDir(): string {
  return path.join(getRepoRoot(), "Input");
}

export function getMaturityRulesPath(): string {
  return path.join(getRepoRoot(), "config", "maturity-rules.yaml");
}

export function getFeatureCatalogPath(): string {
  return path.join(getRepoRoot(), "config", "feature-catalog.yaml");
}

export function getApsLoginUrl(): string | null {
  const clientId = process.env.APS_CLIENT_ID;
  const callback = process.env.APS_CALLBACK_URL;
  if (!clientId || !callback) {
    return null;
  }
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callback,
    scope: "data:read account:read",
  });
  return `https://developer.api.autodesk.com/authentication/v2/authorize?${params.toString()}`;
}
