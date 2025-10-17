export default function Button({
  children,
  variant = 'primary',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
}) {
  const base =
    'w-full rounded-xl px-4 py-3 font-medium shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed';
  const styles =
    variant === 'primary'
      ? 'bg-blue-600 text-white hover:bg-blue-700'
      : 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200';
  return (
    <button {...rest} className={`${base} ${styles} ${rest.className ?? ''}`}>
      {children}
    </button>
  );
}