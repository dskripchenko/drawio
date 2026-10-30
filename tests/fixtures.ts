const files = import.meta.glob('./fixtures/*.drawio', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** A file of tests/fixtures by name. */
export function fixture(name: string): string {
  const source = files[`./fixtures/${name}`]
  if (source === undefined) throw new Error(`No fixture ${name}`)
  return source
}
