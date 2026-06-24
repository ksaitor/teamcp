import { SettingsTabs } from "./settings-tabs";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold">Settings</h1>
      <SettingsTabs />
      <div className="mt-6 max-w-xl space-y-6">{children}</div>
    </div>
  );
}
