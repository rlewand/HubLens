import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { UploadsPageClient } from "./uploads-client";

export default async function UploadsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return <UploadsPageClient userName={session.name} />;
}
