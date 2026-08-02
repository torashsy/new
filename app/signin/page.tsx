import { redirect } from "next/navigation";
import { optionalViewer } from "@/lib/viewer";
import { PasskeyForm } from "@/components/PasskeyForm";
import { demoLoginEnabled } from "@/app/api/auth/demo/route";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (await optionalViewer()) redirect("/");

  return (
    <div className="space-y-10 py-6">
      <header className="space-y-4">
        <h1 className="font-serif text-3xl tracking-wide">かたち</h1>
        <p className="question text-lg leading-relaxed">
          顔写真もチャットもありません。
          <br />
          同じ問いに答えることで、人と出会います。
        </p>
      </header>

      <PasskeyForm demoAvailable={demoLoginEnabled()} />
    </div>
  );
}
