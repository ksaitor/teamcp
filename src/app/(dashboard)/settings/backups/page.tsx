import { requireAdmin } from "@/lib/auth";
import { BackupExport } from "./backup-export";
import { BackupRestore } from "./backup-restore";

export default async function BackupsPage() {
  await requireAdmin();

  return (
    <>
      <BackupExport />
      <BackupRestore />
    </>
  );
}
