import { currentUser } from "@/lib/auth";
import Board from "./components/Board";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  if (!user) {
    return (
      <main className="center">
        <h1>Locker Deals</h1>
        <p className="muted">Access is limited to approved users.</p>
        <a className="btn primary" href="/api/auth/signin/google?callbackUrl=/">Sign in with Google</a>
      </main>
    );
  }
  return <Board user={user} />;
}
