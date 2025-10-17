
export default function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        'w-full rounded-xl border p-3 outline-none transition ' +
        'border-neutral-300 focus:border-blue-500 ' +
        (props.className ?? '')
      }
    />
  );
}