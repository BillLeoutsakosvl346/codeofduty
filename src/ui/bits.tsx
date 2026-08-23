import { FONT, T, glow } from "./theme";

export function Label({ children, color }: { children: React.ReactNode; color?: string }) {
  return <div className="label" style={{ color: color ?? T.ink3 }}>{children}</div>;
}

export function Big({ children, color, size = 72 }: { children: React.ReactNode; color?: string; size?: number }) {
  const c = color ?? T.ink;
  return <div className="display" style={{ fontSize: size, lineHeight: 0.95, letterSpacing: 1, color: c, textShadow: glow(c), textTransform: "uppercase" }}>{children}</div>;
}

export function Panel({ children, color, style, className }: { children: React.ReactNode; color?: string; style?: React.CSSProperties; className?: string }) {
  const c = color ?? T.borderStrong;
  return (
    <div className={`chamfer ${className ?? ""}`} style={{ background: `linear-gradient(135deg, ${c}, ${c}33 40%, ${c}33 60%, ${c})`, padding: 1, ...style }}>
      <div className="chamfer panel-inner">{children}</div>
    </div>
  );
}

export function Hud({ label, value, color, hint }: { label: string; value: string; color?: string; hint?: string }) {
  const c = color ?? T.cyan;
  return (
    <div className="hud stat-hud" style={{ ["--hud" as string]: c }}>
      <Label>{label}</Label>
      <div className="display" style={{ fontSize: 34, lineHeight: 1, marginTop: 6, color: c, textShadow: glow(c) }}>{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Button({ children, onClick, color, small, href }: { children: React.ReactNode; onClick?: () => void; color?: string; small?: boolean; href?: string }) {
  const c = color ?? T.cyan;
  const style: React.CSSProperties = {
    background: c,
    border: "none",
    color: T.bg,
    padding: small ? "8px 16px" : "12px 24px",
    fontFamily: FONT,
    fontSize: small ? 12 : 13,
    fontWeight: 900,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    cursor: "pointer",
    boxShadow: glow(c),
    textDecoration: "none",
    display: "inline-block",
  };
  return href ? <a className="chamfer-sm cod-button" href={href} style={style}>{children}</a> : <button className="chamfer-sm cod-button" onClick={onClick} style={style}>{children}</button>;
}

export function Tag({ children, color }: { children: React.ReactNode; color?: string }) {
  const c = color ?? T.ink2;
  return <span className="chamfer-sm tag" style={{ color: c, background: `${c}1f` }}>{children}</span>;
}

export function Bar({ pct, color, height = 8 }: { pct: number; color: string; height?: number }) {
  return <div className="chamfer-sm bar-track" style={{ height }}><div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: `linear-gradient(90deg, ${color}88, ${color})`, boxShadow: glow(color) }} /></div>;
}
