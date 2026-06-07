interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div className={['bg-white rounded-xl border border-slate-200 shadow-sm', className].join(' ')}>
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={['px-6 py-4 border-b border-slate-200', className].join(' ')}>{children}</div>
  );
}

export function CardBody({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={['px-6 py-4', className].join(' ')}>{children}</div>;
}
