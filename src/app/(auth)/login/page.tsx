import { getConfig } from "@/lib/config";
import LoginForm from "./login-form";

export default function LoginPage() {
  const config = getConfig();
  const providers = {
    google: !!config.GOOGLE_CLIENT_ID && !!config.GOOGLE_CLIENT_SECRET,
    github: !!config.GITHUB_CLIENT_ID && !!config.GITHUB_CLIENT_SECRET,
  };
  return <LoginForm providers={providers} />;
}
