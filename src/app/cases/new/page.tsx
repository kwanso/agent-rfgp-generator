import Link from "next/link";
import { IntakeForm } from "@/components/IntakeForm";

export default function NewCase() {
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
        ← Workflow
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Identify potential applicant</h1>
      <p className="mt-1 text-sm text-slate-500">Intake and lawful status screen.</p>
      <IntakeForm />
    </div>
  );
}
