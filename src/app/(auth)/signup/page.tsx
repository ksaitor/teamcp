import { getConfig } from "@/lib/config";
import SignupForm from "./signup-form";

export default function SignupPage() {
  const config = getConfig();
  const providers = {
    google: !!config.GOOGLE_CLIENT_ID && !!config.GOOGLE_CLIENT_SECRET,
    github: !!config.GITHUB_CLIENT_ID && !!config.GITHUB_CLIENT_SECRET,
  };
  return <SignupForm providers={providers} />;
}
