export function Pill({ tone = "cream", className = "", children, ...rest }) {
  return (
    <span className={`pill pill--${tone} ${className}`} {...rest}>
      {children}
    </span>
  );
}

export function Avatar({
  identity,
  size = 34,
  border = 4,
  fontSize,
  bob = false,
  className = "",
  style,
  children,
  ...rest
}) {
  return (
    <span
      className={`avatar ${bob ? "avatar--bob" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        borderWidth: border,
        background: identity.color,
        color: identity.onColor,
        fontSize: fontSize ?? Math.round(size * 0.46),
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}

export function StickerButton({ as: Component = "button", tone = "yellow", className = "", ...rest }) {
  return <Component className={`sticker-button sticker-button--${tone} ${className}`} {...rest} />;
}

export function CheckerStrip({ className = "" }) {
  return <div className={`checker-strip ${className}`} aria-hidden="true" />;
}

export function KartPlaceholder({ className = "", children }) {
  return <div className={`kart-placeholder ${className}`}>{children}</div>;
}

export function StatusDot({ tone, className = "" }) {
  return <span className={`status-dot status-dot--${tone} ${className}`} aria-hidden="true" />;
}

export function RoundDot({ state, className = "", children }) {
  return <span className={`round-dot round-dot--${state} ${className}`}>{children}</span>;
}

export function ErrorBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="error-banner" role="alert">
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss error">
        ×
      </button>
    </div>
  );
}

export function ConnectionBadge({ connection }) {
  if (connection === "connected") return null;
  return (
    <div className="connection-badge" role="status">
      {connection === "connecting" ? "CONNECTING…" : "RECONNECTING…"}
    </div>
  );
}
