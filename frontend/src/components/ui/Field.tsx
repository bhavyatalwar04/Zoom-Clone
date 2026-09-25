import clsx from "clsx";
import { forwardRef } from "react";

export const inputClass =
  "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition placeholder:text-muted/80 focus:border-zoom-blue focus:ring-2 focus:ring-zoom-blue/15 disabled:bg-surface";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={clsx(inputClass, invalid && "border-zoom-red focus:border-zoom-red focus:ring-zoom-red/15", className)}
        {...rest}
      />
    );
  },
);

export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx(inputClass, "cursor-pointer pr-8", className)} {...rest} />;
}

export function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-bold text-ink-2">
      {children}
    </label>
  );
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1.5 text-xs text-zoom-red">{children}</p>;
}
