"use client";

import { useActionState, useState } from "react";
import { createCase } from "@/app/actions";

export function IntakeForm() {
  const [state, action, pending] = useActionState(createCase, undefined);
  const [location, setLocation] = useState("OUTSIDE_US");
  const [usStatus, setUsStatus] = useState("LAWFUL");

  return (
    <form action={action} className="card mt-6 space-y-6 p-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">Applicant</legend>
        <Field name="applicantName" label="Full name" placeholder="Maria Gonzalez" />
        <Field name="email" label="Email" type="email" placeholder="maria@example.com" />
        <Field name="nationality" label="Nationality (passport country)" placeholder="Spain" />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-semibold">Lawful status screen</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["OUTSIDE_US", "Outside the U.S.", "Foreign national living abroad"],
            ["IN_US", "In the U.S.", "Currently inside the United States"],
          ].map(([value, title, hint]) => (
            <label key={value} className={`cursor-pointer rounded-lg border p-3 ${location === value ? "border-emerald-600 bg-emerald-50" : "border-slate-300"}`}>
              <input type="radio" name="location" value={value} checked={location === value} onChange={() => setLocation(value)} className="sr-only" />
              <div className="text-sm font-medium">{title}</div>
              <div className="text-xs text-slate-500">{hint}</div>
            </label>
          ))}
        </div>
        {location === "IN_US" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="usStatus">
                Status in the U.S.
              </label>
              <select id="usStatus" name="usStatus" className="input" value={usStatus} onChange={(e) => setUsStatus(e.target.value)}>
                <option value="LAWFUL">Lawful status (visa / other status)</option>
                <option value="TPS">TPS (Temporary Protected Status)</option>
                <option value="UNLAWFUL">No lawful status</option>
              </select>
            </div>
            {usStatus === "LAWFUL" && <Field name="currentVisa" label="Current status" placeholder="e.g. F-1, H-1B, B-2" required={false} />}
            {usStatus === "UNLAWFUL" && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 sm:col-span-2">This case will STOP at screening. Firm guidance: the applicant must self-deport first.</p>
            )}
            {usStatus === "TPS" && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 sm:col-span-2">TPS is a gray area. The case will continue with an attorney flag for the consultation.</p>
            )}
          </div>
        )}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">Proposed business</legend>
        <Field name="businessName" label="Business name" placeholder="Sol Coffee Roasters LLC" />
        <Field name="businessType" label="Business type" placeholder="Specialty coffee shop" />
        <Field name="investmentAmount" label="Planned investment (USD)" type="number" placeholder="150000" />
      </fieldset>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex justify-end">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Screening..." : "Run screen and create case"}
        </button>
      </div>
    </form>
  );
}

function Field({ name, label, type = "text", placeholder, required = true }: { name: string; label: string; type?: string; placeholder?: string; required?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input id={name} name={name} type={type} placeholder={placeholder} required={required} className="input" />
    </div>
  );
}
