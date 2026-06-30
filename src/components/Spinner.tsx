export interface SpinnerProps {
  className?: string;
  label?: string;
}

export function Spinner({ className = "", label }: SpinnerProps) {
  return (
    <div
      className={`flex items-center justify-center gap-2 text-sm text-neutral-500 ${className}`}
      role="status"
      aria-live="polite"
    >
      <span
        className="h-5 w-5 animate-spin rounded-full border-2 border-brand/30 border-t-brand"
        aria-hidden="true"
      />
      {label ? <span>{label}</span> : <span className="sr-only">読み込み中</span>}
    </div>
  );
}

export default Spinner;
