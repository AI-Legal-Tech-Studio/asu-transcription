type LoginFormProps = {
  disabled?: boolean;
};

export function LoginForm({ disabled = false }: LoginFormProps) {
  return (
    <form action="/api/login" className="form-stack" method="post">
      <label className="field">
        <span className="field-label">Email</span>
        <input
          autoComplete="email"
          disabled={disabled}
          name="email"
          placeholder="you@asu.edu"
          required
          type="email"
        />
      </label>

      <label className="field">
        <span className="field-label">Password</span>
        <input
          autoComplete="current-password"
          disabled={disabled}
          name="password"
          placeholder="Enter your password"
          required
          type="password"
        />
      </label>

      <button className="primary-button" type="submit">
        Sign in
      </button>

      <p className="form-footnote">
        Access is limited to configured clinic accounts. Review every transcript
        and summary before it becomes part of legal work product.
      </p>
    </form>
  );
}
