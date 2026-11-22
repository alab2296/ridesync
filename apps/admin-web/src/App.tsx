import { useState, type FormEvent } from "react";
import { login } from "./api";
import { TripsPage } from "./TripsPage";

export function App() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      setToken(await login(String(form.get("email")), String(form.get("password"))));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <main>
      <h1>RideSync Admin</h1>
      {token ? (
        <TripsPage token={token} />
      ) : (
        <form onSubmit={onSubmit}>
          <input name="email" type="email" placeholder="Email" required />{" "}
          <input name="password" type="password" placeholder="Password" required />{" "}
          <button type="submit">Sign in</button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </main>
  );
}
