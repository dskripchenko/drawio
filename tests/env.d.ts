/// <reference types="vite/client" />
// Fixtures are imported as text through Vite's `?raw` suffix.
declare module '*.drawio?raw' {
  const source: string
  export default source
}
