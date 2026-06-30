import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary:
    "border border-brand/40 bg-white text-brand-dark hover:bg-brand/5",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-brand-dark hover:bg-brand/5",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", fullWidth, className = "", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${
          fullWidth ? "w-full" : ""
        } ${className}`}
        {...props}
      />
    );
  },
);

export default Button;
