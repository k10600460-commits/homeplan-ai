import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GenerateClient from "./GenerateClient";

export const metadata = { title: "Generate Floor Plans — SplanAI" };

export default async function GeneratePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/generate");
  return <GenerateClient />;
}
