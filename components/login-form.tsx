export function LoginForm() {
  return (
    <form action="/api/login" className="stack" method="post">
      <label className="field">
        <span>Email</span>
        <input
          autoComplete="email"
          name="email"
          placeholder="you@asu.edu"
          required
          type="email"
        />
      </label>

      <label className="field">
        <span>Password</span>
        <input
          autoComplete="current-password"
          name="password"
          placeholder="Enter your password"
          required
          type="password"
        />
      </label>

      <button className="primary-button" type="submit">
        Sign in
      </button>
    </form>
  );
}
