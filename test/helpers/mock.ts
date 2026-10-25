/**
 * A mapped type that contains only the public members of T.
 * `keyof T` in TypeScript only yields public members, so private/protected
 * class fields are automatically excluded.
 */
type PublicOf<T> = { [K in keyof T]: T[K] };

/**
 * Creates a partial mock that is typed as T.
 *
 * The single `as T` assertion is valid because T (which has all public members
 * non-optionally) is always assignable to Partial<PublicOf<T>> (which makes
 * them all optional). TypeScript therefore allows the narrowing assertion
 * without going through `unknown`.
 *
 * Usage:
 *   const repo = asMock<UsersRepository>({ findById: jest.fn() });
 *   service = new MyService(repo, ...);
 */
export function asMock<T>(partial: Partial<PublicOf<T>>): T {
  return partial as T;
}
