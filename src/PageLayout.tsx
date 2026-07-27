import type { ReactNode } from "react";

type PageShellProps = {
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  label?: string;
  busy?: boolean;
  live?: "off" | "polite" | "assertive";
};

type PageHeaderProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  titleId?: string;
  lead?: ReactNode;
  meta?: ReactNode;
};

function classNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function PageShell({
  children,
  className,
  labelledBy,
  label,
  busy,
  live,
}: PageShellProps) {
  return (
    <section
      className={classNames("page-shell", className)}
      aria-labelledby={labelledBy}
      aria-label={label}
      aria-busy={busy}
      aria-live={live}
    >
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  titleId,
  lead,
  meta,
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <p className="page-eyebrow">{eyebrow}</p>
        <h1 id={titleId}>{title}</h1>
        {lead && <p className="page-lead">{lead}</p>}
      </div>
      {meta && <div className="page-header-meta">{meta}</div>}
    </header>
  );
}
