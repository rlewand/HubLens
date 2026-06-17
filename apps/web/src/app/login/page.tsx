import { redirect } from "next/navigation";
import { getApsLoginUrl, loginMockUser } from "@/lib/auth";
import { isAuthMockEnabled, setSessionCookie } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const apsUrl = getApsLoginUrl();
  const mock = isAuthMockEnabled();

  async function mockLogin() {
    "use server";
    const token = await loginMockUser();
    await setSessionCookie(token);
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#0f1c2e_0%,#1a3650_50%,#0696d7_100%)] p-6">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">HubLens</CardTitle>
          <CardDescription>
            Sign in to analyze ACC / BIM 360 project maturity from Data Connector exports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {apsUrl ? (
            <a href={apsUrl}>
              <Button className="w-full" size="lg">
                Sign in with Autodesk
              </Button>
            </a>
          ) : null}
          {mock ? (
            <form action={mockLogin}>
              <Button type="submit" variant="secondary" className="w-full" size="lg">
                Continue with mock consultant (dev)
              </Button>
            </form>
          ) : null}
          {!apsUrl && !mock ? (
            <p className="text-sm text-muted-foreground">
              Configure APS credentials or set AUTH_MOCK=true for local development.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
