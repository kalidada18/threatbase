import React from "react";

/** App-wide boundary (wraps the router in main.tsx). Its one real job since
 *  the 09-15 audit: stale lazy chunks. A tab open across a deploy references
 *  purged asset hashes ("Failed to fetch dynamically imported module") — the
 *  only fix is a reload, so do it automatically once, guarded against loops. */
export class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch(error: any) {
    const msg = String(error?.message || error)
    if (!/dynamically imported module|module script failed/i.test(msg)) return
    const KEY = 'tb:chunk-reload'
    const now = Date.now()
    // One auto-reload per 10 s window; if the reload lands on the same
    // failure (offline, bad network) fall through to the manual UI.
    if (now - Number(sessionStorage.getItem(KEY) || 0) < 10_000) return
    sessionStorage.setItem(KEY, String(now))
    window.location.reload()
  }
  render() {
    if (this.state.hasError) {
      return <div style={{padding: "50px", color: "red", background: "black"}}><h1>React Crash</h1><pre>{String(this.state.error?.stack || this.state.error)}</pre><p style={{color:"#94a3b8", margin:"16px 0 12px"}}>A stale file from an app update is the usual cause — reloading fixes it.</p><button onClick={() => window.location.reload()} style={{background:"#cf1733", color:"#fff", border:"0", borderRadius:"8px", padding:"10px 18px", fontWeight:700, cursor:"pointer"}}>Reload</button><a href="/" style={{color:"#94a3b8", marginLeft:"16px"}}>Back to home</a></div>;
    }
    return this.props.children;
  }
}
