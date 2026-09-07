import { type InputHTMLAttributes } from 'react';
import { Search } from 'lucide-react';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  wrapperClassName?: string;
}

export default function SearchInput({
  wrapperClassName = '',
  className = '',
  ...props
}: SearchInputProps) {
  return (
    <div className={['relative', wrapperClassName].filter(Boolean).join(' ')}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        className={[
          'w-full rounded-lg border border-slate-300 bg-white text-slate-900 pl-9 pr-3 py-2 text-sm',
          'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-300',
          className,
        ].filter(Boolean).join(' ')}
        {...props}
      />
    </div>
  );
}
