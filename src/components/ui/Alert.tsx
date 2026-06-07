import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const config: Record<AlertVariant, { icon: React.ElementType; classes: string }> = {
  info: { icon: Info, classes: 'bg-blue-50 text-blue-800 border-blue-200' },
  success: { icon: CheckCircle, classes: 'bg-green-50 text-green-800 border-green-200' },
  warning: { icon: AlertTriangle, classes: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  error: { icon: AlertCircle, classes: 'bg-rose-50 text-rose-800 border-rose-200' },
};

export default function Alert({ variant = 'info', title, children, className = '' }: AlertProps) {
  const { icon: Icon, classes } = config[variant];
  return (
    <div className={['flex gap-3 p-4 rounded-lg border', classes, className].join(' ')}>
      <Icon size={18} className="shrink-0 mt-0.5" />
      <div className="flex-1 text-sm">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}
