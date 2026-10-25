// Next.js inlines this public flag at build time. Set it before building the web
// package; server authorization uses ENGLISHPILOT_DEPLOYMENT independently.
export const isHostedWebClient =
  process.env.NEXT_PUBLIC_ENGLISHPILOT_WEB === "1";
