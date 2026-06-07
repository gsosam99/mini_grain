import LoginForm from './LoginForm';
import { Sprout } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 rounded-full mb-4">
            <Sprout size={28} className="text-green-700" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Mini Grain</h1>
          <p className="text-sm text-slate-500 mt-1">Gestión Agrícola · Polar en el Campo</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
