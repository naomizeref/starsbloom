import { UserProfile } from "@clerk/react";

export function ClerkAccountSettings() {
  return <section className="mx-auto w-full max-w-4xl space-y-6 pb-6">
    <h1 className="text-2xl font-bold text-orbit-white">Account security</h1>
    <div className="[&_.cl-rootBox]:w-full [&_.cl-cardBox]:w-full [&_.cl-cardBox]:max-w-full">
      <UserProfile routing="hash" />
    </div>
  </section>;
}
